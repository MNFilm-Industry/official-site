/* ============================================================
   MNfilm 芒柠影业 · 摄影社团 — 交互脚本
   - 语言切换（中 / EN）
   - 导航栏（滚动背景、移动端菜单、章节高亮）
   - 通用轮播引擎（Hero 与作品画廊共用）
     · 修复滑动方向：上一张从左侧滑入，下一张从右侧滑入
     · 自动轮播、键盘、触屏滑动、缩略图、大图查看
   ============================================================ */
(() => {
    'use strict';

    const html = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* ================= 语言切换 ================= */
    let currentLang = html.lang.startsWith('en') ? 'en' : 'zh';

    function applyLanguage() {
        html.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
        html.dataset.lang = currentLang;
        document.querySelectorAll('[lang-text]').forEach(el => {
            el.hidden = el.getAttribute('lang-text') !== currentLang;
        });
        document.querySelectorAll('[data-label-zh]').forEach(el => {
            el.setAttribute('aria-label', el.dataset[currentLang === 'zh' ? 'labelZh' : 'labelEn']);
        });
        const switchButton = document.getElementById('langSwitch');
        if (switchButton) {
            switchButton.textContent = currentLang === 'zh' ? 'EN' : '中文';
            switchButton.setAttribute('aria-label', currentLang === 'zh' ? 'Switch to English' : '切换到中文');
        }
        document.title = currentLang === 'zh' ? '芒柠影业 MNfilm · 摄影社团' : 'MNfilm · Photography Club';
        document.dispatchEvent(new Event('languagechange'));
    }

    const langSwitch = document.getElementById('langSwitch');
    if (langSwitch) {
        langSwitch.addEventListener('click', () => {
            currentLang = currentLang === 'zh' ? 'en' : 'zh';
            applyLanguage();
        });
    }
    applyLanguage();

    /* ================= 导航栏 ================= */
    const nav = document.querySelector('.nav');
    const navToggle = document.querySelector('.nav-toggle');
    const navLinksPanel = document.querySelector('.nav-links');

    if (nav && navToggle && navLinksPanel) {
        const isChinese = () => html.lang.startsWith('zh');
        const setMenu = open => {
            nav.classList.toggle('nav-open', open);
            navToggle.setAttribute('aria-expanded', String(open));
            navToggle.setAttribute('aria-label',
                open ? (isChinese() ? '关闭菜单' : 'Close menu')
                     : (isChinese() ? '打开菜单' : 'Open menu'));
        };
        navToggle.addEventListener('click', () => setMenu(!nav.classList.contains('nav-open')));
        navLinksPanel.addEventListener('click', event => {
            if (event.target.closest('a')) setMenu(false);
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') setMenu(false);
        });
        const onScroll = () => nav.classList.toggle('nav-scrolled', window.scrollY > 8);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
    }

    /* 章节滚动高亮 */
    const navAnchors = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'));
    const sections = navAnchors.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
    if ('IntersectionObserver' in window && sections.length) {
        const spy = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                navAnchors.forEach(a => {
                    if (a.getAttribute('href') === '#' + entry.target.id) a.setAttribute('aria-current', 'page');
                    else a.removeAttribute('aria-current');
                });
            });
        }, { rootMargin: '-40% 0px -55% 0px' });
        sections.forEach(section => spy.observe(section));
    }

    /* ================= Logo 降级 ================= */
    document.querySelectorAll('.nav-logo-wrap').forEach(wrap => {
        const logo = wrap.querySelector('img');
        const fallback = wrap.querySelector('.logo-fallback');
        if (!logo || !fallback) return;
        const showFallback = () => {
            logo.hidden = true;
            fallback.hidden = false;
        };
        logo.addEventListener('error', showFallback);
        if (logo.complete && !logo.naturalWidth) showFallback();
    });

    /* ================= 通用轮播引擎 ================= */
    function initSlideshow(root, options) {
        const opts = Object.assign({
            autoplay: true,        // 默认开启自动轮播
            delay: 5000,           // 轮播间隔
            progress: false,       // 是否显示进度条（Hero）
            dialog: null           // 大图 dialog（作品画廊）
        }, options);

        const frame = root.querySelector('.carousel-frame');
        const stage = root.querySelector('.carousel-stage');
        const track = root.querySelector('.carousel-track');
        let image = root.querySelector('.carousel-image');
        const thumbs = Array.from(root.querySelectorAll('.carousel-thumb'));
        const strip = root.querySelector('.carousel-thumbs');
        const caption = root.querySelector('.carousel-caption-name');
        const counter = root.querySelector('.carousel-current');
        const totalLabel = root.querySelector('.carousel-total');
        const status = root.querySelector('.carousel-status');
        const autoplayButton = root.querySelector('.carousel-autoplay');
        const autoplayLabel = root.querySelector('.carousel-autoplay-label');
        const autoplayIcon = root.querySelector('.carousel-autoplay-icon');
        const progress = root.querySelector('.carousel-progress');
        const expandButton = root.querySelector('.carousel-expand');
        const dialog = opts.dialog;
        const dialogImage = dialog && dialog.querySelector('.carousel-image');
        const dialogCount = dialog && dialog.querySelector('.carousel-dialog-count');

        if (!frame || !stage || !track || !image || !thumbs.length) return null;

        const language = () => html.lang.startsWith('en') ? 'en' : 'zh';
        const padded = value => String(value).padStart(2, '0');
        const photoAlt = index => language() === 'zh'
            ? `芒柠影业摄影作品 ${padded(index + 1)}，${thumbs[index].dataset.name}`
            : `MNfilm photograph ${padded(index + 1)}, ${thumbs[index].dataset.name}`;

        let current = 0;
        let requested = 0;
        let selection = 0;
        let failed = false;
        let loading = false;
        let autoplayOn = opts.autoplay;
        let autoplayTimer = null;
        let activeSlide = null;
        let automaticSelection = null;
        let returnFocus = null;
        let inView = true;

        if (totalLabel) totalLabel.textContent = padded(thumbs.length);

        /* ---------- 文案更新 ---------- */
        function updateAutoplayLabel() {
            if (!autoplayButton || !autoplayLabel || !autoplayIcon) return;
            const isChinese = language() === 'zh';
            autoplayLabel.textContent = autoplayOn
                ? (isChinese ? '暂停轮播' : 'Pause')
                : (isChinese ? '继续轮播' : 'Play');
            autoplayButton.setAttribute('aria-label', autoplayOn
                ? (isChinese ? '暂停自动轮播' : 'Pause automatic slideshow')
                : (isChinese ? '继续自动轮播' : 'Resume automatic slideshow'));
            autoplayIcon.textContent = autoplayOn ? 'Ⅱ' : '▶';
        }

        function updateLanguage() {
            const isChinese = language() === 'zh';
            image.alt = photoAlt(current);
            if (dialogImage) dialogImage.alt = image.alt;
            if (status) {
                status.textContent = failed
                    ? (isChinese ? '这张照片暂时无法加载，请重试或查看其他照片。' : 'This photo could not load. Please retry or select another photo.')
                    : '';
            }
            updateAutoplayLabel();
        }

        /* ---------- 自动轮播 ---------- */
        function stopAutoplay() {
            window.clearTimeout(autoplayTimer);
            autoplayTimer = null;
            if (progress) {
                progress.getAnimations().forEach(animation => animation.cancel());
                progress.style.transition = 'none';
                progress.style.transform = 'scaleX(0)';
            }
        }

        function armProgress(delay) {
            if (!progress || reducedMotion.matches) return;
            progress.getAnimations().forEach(animation => animation.cancel());
            progress.style.transition = 'none';
            progress.style.transform = 'scaleX(0)';
            void progress.offsetWidth;
            progress.style.transition = `transform ${delay}ms linear`;
            progress.style.transform = 'scaleX(1)';
        }

        function restartAutoplay(delay = opts.delay) {
            stopAutoplay();
            const canPlay = autoplayOn && !document.hidden && !(dialog && dialog.open)
                && thumbs.length > 1 && inView;
            if (counter) counter.parentElement.setAttribute('aria-live', canPlay ? 'off' : 'polite');
            if (!canPlay || loading) return;
            armProgress(delay);
            autoplayTimer = window.setTimeout(() => {
                autoplayTimer = null;
                showPhoto(requested + 1, true);
            }, delay);
        }

        function cancelAutomaticLoad() {
            if (automaticSelection !== selection) return;
            ++selection;
            automaticSelection = null;
            requested = current;
            loading = false;
            stage.classList.remove('is-loading');
            stage.setAttribute('aria-busy', 'false');
        }

        /* ---------- 大图同步 ---------- */
        function syncDialog() {
            if (!dialog || !dialog.open) return;
            dialogImage.src = thumbs[current].href;
            dialogImage.alt = photoAlt(current);
            dialogCount.textContent = `${padded(current + 1)} / ${padded(thumbs.length)}`;
        }

        function scrollThumbnailIntoView() {
            if (!strip || strip.hidden || !thumbs[current]) return;
            const active = thumbs[current];
            const thumbBounds = active.getBoundingClientRect();
            const stripBounds = strip.getBoundingClientRect();
            if (thumbBounds.left < stripBounds.left || thumbBounds.right > stripBounds.right) {
                strip.scrollTo({
                    left: strip.scrollLeft + thumbBounds.left - stripBounds.left - (strip.clientWidth - active.clientWidth) / 2,
                    behavior: reducedMotion.matches ? 'instant' : 'smooth'
                });
            }
        }

        /* ---------- 滑动动画（方向修复） ----------
           前进：旧图在左、新图在右，轨道 0 → -100%，新图自右侧滑入
           后退：新图在左、旧图在右，轨道 -100% → 0，新图自左侧滑入 */
        function settleSlide() {
            if (!activeSlide) return;
            const { animation, nextImage } = activeSlide;
            activeSlide = null;
            track.replaceChildren(nextImage);
            animation.cancel();
        }

        async function slideTo(nextImage, forward) {
            settleSlide();
            const previousImage = image;
            image = nextImage;
            if (reducedMotion.matches || typeof track.animate !== 'function') {
                track.replaceChildren(nextImage);
                return;
            }
            previousImage.setAttribute('aria-hidden', 'true');
            track.replaceChildren(forward ? previousImage : nextImage, forward ? nextImage : previousImage);
            const animation = track.animate([
                { transform: forward ? 'translate3d(0, 0, 0)' : 'translate3d(-100%, 0, 0)' },
                { transform: forward ? 'translate3d(-100%, 0, 0)' : 'translate3d(0, 0, 0)' }
            ], {
                duration: 600,
                easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                fill: 'forwards'
            });
            const slide = { animation, nextImage };
            activeSlide = slide;
            try {
                await animation.finished;
            } catch {
                // 新的选择会立即结束上一次滑动。
            } finally {
                if (activeSlide === slide) settleSlide();
            }
        }

        /* ---------- 切换照片 ---------- */
        async function showPhoto(index, automatic = false) {
            stopAutoplay();
            const startedAt = window.performance.now();
            loading = true;
            const total = thumbs.length;
            const nextIndex = (index + total) % total;
            requested = nextIndex;
            const token = ++selection;
            automaticSelection = automatic ? token : null;
            if (nextIndex === current) {
                settleSlide();
                loading = false;
                automaticSelection = null;
                stage.classList.remove('is-loading');
                stage.setAttribute('aria-busy', 'false');
                restartAutoplay();
                return;
            }
            // 方向判定：取「前进/后退」中较短的路径，保证首尾衔接方向自然
            const forward = ((nextIndex - current + total) % total) <= total / 2;
            const thumb = thumbs[nextIndex];
            const loader = new Image();
            stage.classList.add('is-loading');
            stage.setAttribute('aria-busy', 'true');
            failed = false;
            if (status) status.textContent = '';
            loader.sizes = image.sizes || '100vw';
            loader.srcset = thumb.dataset.srcset;
            loader.src = thumb.href;
            loader.className = 'carousel-image';
            loader.width = Number(thumb.dataset.width);
            loader.height = Number(thumb.dataset.height);
            loader.draggable = false;

            try {
                await loader.decode();
                if (token !== selection) return;
                // 防御：始终只展示横向照片
                if (loader.naturalWidth <= loader.naturalHeight) throw new Error('Landscape photos only');
                current = nextIndex;
                loader.alt = photoAlt(current);
                stage.classList.remove('is-loading');
                const movement = slideTo(loader, forward);
                if (caption) caption.textContent = thumb.dataset.name;
                if (counter) counter.textContent = padded(current + 1);
                thumbs.forEach((item, position) => {
                    if (position === current) item.setAttribute('aria-current', 'true');
                    else item.removeAttribute('aria-current');
                });
                scrollThumbnailIntoView();
                syncDialog();
                await movement;
            } catch {
                if (token !== selection) return;
                requested = current;
                failed = true;
                updateLanguage();
            } finally {
                if (token === selection) {
                    loading = false;
                    automaticSelection = null;
                    stage.classList.remove('is-loading');
                    stage.setAttribute('aria-busy', 'false');
                    // 自动轮播按完整周期计时（含动画时间）
                    const remaining = automatic ? Math.max(0, opts.delay - (window.performance.now() - startedAt)) : opts.delay;
                    restartAutoplay(remaining);
                }
            }
        }

        /* ---------- 事件绑定 ---------- */
        thumbs.forEach((thumb, index) => {
            thumb.addEventListener('click', event => {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                showPhoto(index);
            });
        });

        root.querySelectorAll('[data-gallery-step]').forEach(button => {
            button.addEventListener('click', () => showPhoto(requested + Number(button.dataset.galleryStep)));
        });

        function handleKeys(event) {
            if (event.key === 'Escape' && dialog && dialog.open) {
                event.preventDefault();
                dialog.close();
                return;
            }
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            const steps = { ArrowLeft: requested - 1, ArrowRight: requested + 1, Home: 0, End: thumbs.length - 1 };
            if (!(event.key in steps)) return;
            frame.classList.add('is-keyboard-interacting');
            event.preventDefault();
            showPhoto(steps[event.key]);
        }
        frame.addEventListener('keydown', handleKeys);
        if (dialog) dialog.addEventListener('keydown', handleKeys);
        document.addEventListener('keydown', event => {
            if (event.key === 'Tab') frame.classList.add('is-keyboard-interacting');
        });
        frame.addEventListener('pointerdown', () => frame.classList.remove('is-keyboard-interacting'));
        frame.addEventListener('pointerleave', () => frame.classList.remove('is-keyboard-interacting'));

        /* 触屏滑动 */
        [stage, dialog && dialog.querySelector('.carousel-stage')].filter(Boolean).forEach(surface => {
            let touchStart = null;
            surface.addEventListener('touchstart', event => {
                touchStart = event.touches.length === 1
                    ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
                    : null;
            }, { passive: true });
            surface.addEventListener('touchend', event => {
                if (!touchStart || event.touches.length || !event.changedTouches.length) return;
                const deltaX = event.changedTouches[0].clientX - touchStart.x;
                const deltaY = event.changedTouches[0].clientY - touchStart.y;
                touchStart = null;
                if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
                    showPhoto(requested + (deltaX < 0 ? 1 : -1));
                }
            }, { passive: true });
            surface.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
        });

        /* 大图查看 */
        if (expandButton && dialog) {
            expandButton.addEventListener('click', () => {
                stopAutoplay();
                cancelAutomaticLoad();
                returnFocus = document.activeElement;
                dialog.showModal();
                document.body.classList.add('gallery-open');
                syncDialog();
                restartAutoplay();
            });
            const closeButton = dialog.querySelector('.carousel-close');
            if (closeButton) closeButton.addEventListener('click', () => dialog.close());
            dialog.addEventListener('close', () => {
                document.body.classList.remove('gallery-open');
                if (returnFocus) returnFocus.focus({ preventScroll: true });
                restartAutoplay();
            });
            dialog.addEventListener('click', event => {
                if (event.target === dialog) dialog.close();
            });
            dialog.querySelectorAll('[data-gallery-step]').forEach(button => {
                button.addEventListener('click', () => showPhoto(requested + Number(button.dataset.galleryStep)));
            });
        }

        /* 自动轮播控制 */
        if (autoplayButton) {
            autoplayButton.addEventListener('click', () => {
                autoplayOn = !autoplayOn;
                if (!autoplayOn) cancelAutomaticLoad();
                updateAutoplayLabel();
                restartAutoplay();
            });
        }

        /* 离开视口 / 页面隐藏时暂停 */
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver(entries => {
                inView = entries[0].isIntersecting;
                if (!inView) {
                    cancelAutomaticLoad();
                    stopAutoplay();
                } else {
                    restartAutoplay();
                }
            }, { threshold: 0.2 });
            observer.observe(frame);
        }
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) cancelAutomaticLoad();
            restartAutoplay();
        });
        window.addEventListener('pagehide', () => {
            stopAutoplay();
            cancelAutomaticLoad();
        });
        window.addEventListener('pageshow', () => restartAutoplay());
        document.addEventListener('languagechange', updateLanguage);

        /* 启动 */
        updateLanguage();
        restartAutoplay();
    }

    /* ================= 初始化 ================= */
    initSlideshow(document.querySelector('.hero'), {
        autoplay: true,
        delay: 5000,
        progress: true
    });
    initSlideshow(document.querySelector('.section-gallery'), {
        autoplay: true,
        delay: 5000,
        dialog: document.querySelector('.carousel-dialog')
    });
})();
