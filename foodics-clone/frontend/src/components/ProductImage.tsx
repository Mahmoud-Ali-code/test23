'use client';
import React from 'react';

/**
 * Renders a product's image field, which can be:
 *  - a URL/path starting with "/" or "http(s)://" → real <img>
 *  - any other string → treated as an emoji / short text glyph
 *
 * The fallback "🍽️" is shown if `value` is null/empty.
 */
export function ProductImage({
  value,
  className = '',
  alt = '',
  fallback = '🍽️',
}: {
  value?: string | null;
  className?: string;
  alt?: string;
  fallback?: string;
}) {
  const v = value || fallback;
  const isUrl = typeof v === 'string' && (/^https?:\/\//i.test(v) || v.startsWith('/'));
  if (isUrl) {
    return (
      <img
        src={v}
        alt={alt}
        className={className}
        loading="lazy"
        onError={(e) => {
          // If the image file is missing, fall back to the emoji so we never
          // show a broken-image icon in the POS.
          const el = e.currentTarget as HTMLImageElement;
          el.style.display = 'none';
          if (el.parentElement) {
            const span = document.createElement('span');
            span.textContent = fallback;
            el.parentElement.appendChild(span);
          }
        }}
      />
    );
  }
  return <span className={className}>{v}</span>;
}
