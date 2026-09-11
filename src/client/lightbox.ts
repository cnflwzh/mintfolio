import { createPageScope, type Cleanup } from './lifecycle.js';

/** Theme-owned image-preview elements. Core supplies zoom, pan, keyboard and cleanup behavior. */
export interface LightboxOptions {
  root: HTMLElement;
  dialog: HTMLDialogElement;
  image: HTMLImageElement;
  viewport: HTMLElement;
  zoomIn: HTMLButtonElement;
  zoomOut: HTMLButtonElement;
  zoomLevel: HTMLOutputElement;
  reset: HTMLElement;
  close?: HTMLElement | null;
  minScale?: number;
  maxScale?: number;
  step?: number;
  signal?: AbortSignal;
}

export interface LightboxController { close(): void; reset(): void; dispose: Cleanup; }

/** Mount one preview; linked article images keep their original navigation. */
export function createLightboxController(input: LightboxOptions): LightboxController {
  const { root, dialog, image, viewport, zoomIn, zoomOut, zoomLevel, reset } = input;
  const scope = createPageScope();
  const options = { signal: scope.signal };
  const minScale = input.minScale ?? 0.5;
  const maxScale = input.maxScale ?? 4;
  const step = input.step ?? 0.25;
  if (![minScale, maxScale, step].every((value) => Number.isFinite(value) && value > 0) || minScale > 1 || maxScale < 1) {
    throw new Error('Lightbox scale bounds must include 1 and the step must be positive and finite');
  }
  let scale = 1;
  let x = 0;
  let y = 0;
  let drag: { id: number; clientX: number; clientY: number; x: number; y: number } | null = null;

  const render = (): void => {
    const maxX = Math.max(0, (image.offsetWidth * scale - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * scale - viewport.clientHeight) / 2);
    x = Math.max(-maxX, Math.min(maxX, x));
    y = Math.max(-maxY, Math.min(maxY, y));
    image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    image.style.cursor = maxX || maxY ? (drag ? 'grabbing' : 'grab') : 'default';
    zoomLevel.value = `${Math.round(scale * 100)}%`;
    zoomIn.disabled = scale >= maxScale;
    zoomOut.disabled = scale <= minScale;
  };

  const stopDragging = (): void => {
    const pointerId = drag?.id;
    drag = null;
    if (pointerId !== undefined && image.hasPointerCapture(pointerId)) image.releasePointerCapture(pointerId);
    render();
  };

  const resetView = (): void => {
    scale = 1;
    x = 0;
    y = 0;
    stopDragging();
  };

  const setScale = (value: number): void => {
    const next = Math.max(minScale, Math.min(maxScale, value));
    x *= next / scale;
    y *= next / scale;
    scale = next;
    render();
  };

  zoomIn.addEventListener('click', () => setScale(scale + step), options);
  zoomOut.addEventListener('click', () => setScale(scale - step), options);
  reset.addEventListener('click', resetView, options);
  image.addEventListener('load', render, options);
  window.addEventListener('resize', () => { if (dialog.open) render(); }, options);
  viewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (event.deltaY) setScale(scale - Math.sign(event.deltaY) * step);
  }, { ...options, passive: false });
  dialog.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault();
      if (event.key === '0') resetView();
      else setScale(scale + (event.key === '-' ? -step : step));
    }
  }, options);

  image.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || scale <= 1) return;
    event.preventDefault();
    drag = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, x, y };
    image.setPointerCapture(event.pointerId);
    render();
  }, options);
  image.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    x = drag.x + event.clientX - drag.clientX;
    y = drag.y + event.clientY - drag.clientY;
    render();
  }, options);
  image.addEventListener('pointerup', stopDragging, options);
  image.addEventListener('pointercancel', stopDragging, options);
  image.addEventListener('lostpointercapture', stopDragging, options);

  for (const source of root.querySelectorAll('img')) {
    // Linked images retain their author's navigation behavior.
    if (source.closest('a')) continue;
    const attributes = ['tabindex', 'role', 'aria-haspopup', 'aria-label'].map((name) => [name, source.getAttribute(name)] as const);
    const cursor = source.style.cursor;
    scope.add(() => {
      for (const [name, value] of attributes) {
        if (value === null) source.removeAttribute(name); else source.setAttribute(name, value);
      }
      source.style.cursor = cursor;
    });
    source.tabIndex = 0;
    source.setAttribute('role', 'button');
    source.setAttribute('aria-haspopup', 'dialog');
    source.setAttribute('aria-label', `放大图片：${source.alt || '文章插图'}`);
    source.style.cursor = 'zoom-in';
    const open = (): void => {
      image.src = source.currentSrc || source.src;
      image.alt = source.alt;
      dialog.showModal();
      resetView();
    };
    source.addEventListener('click', open, options);
    source.addEventListener(
      'keydown',
      (event) => {
        if (['Enter', ' '].includes(event.key)) {
          event.preventDefault();
          open();
        }
      },
      options,
    );
  }
  input.close?.addEventListener('click', () => dialog.close(), options);
  dialog.addEventListener(
    'click',
    (event) => {
      if (event.target === dialog || event.target === viewport) dialog.close();
    },
    options,
  );
  const clearImage = (): void => {
    image.removeAttribute('src');
    image.alt = '图片预览';
    resetView();
  };
  dialog.addEventListener('close', clearImage, options);
  scope.add(() => {
    dialog.close();
    clearImage();
  });
  input.signal?.addEventListener('abort', scope.dispose, { once: true });
  scope.add(() => input.signal?.removeEventListener('abort', scope.dispose));
  if (input.signal?.aborted) scope.dispose();
  return { close: () => dialog.close(), reset: resetView, dispose: scope.dispose };
}
