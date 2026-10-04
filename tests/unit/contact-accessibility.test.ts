import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import ContactForm from '../../src/components/ContactForm';

const html = renderToStaticMarkup(createElement(ContactForm));
describe('contact form mobile accessibility', () => {
  it.each(['name', 'phone', 'email', 'type', 'message'])('connects the %s label to its form control', name => {
    expect(html).toContain(`for="contact-${name}"`);
    const control = html.match(new RegExp(`<[^>]+id="contact-${name}"[^>]*>`))?.[0] ?? '';
    expect(control).toContain(`name="${name}"`);
  });
  it('preserves field names and required constraints while providing a telephone keyboard', () => {
    expect(html).toMatch(/id="contact-phone"[^>]*type="tel"[^>]*required=""/);
    expect(html).toMatch(/id="contact-name"[^>]*required=""/);
    expect(html).toMatch(/id="contact-message"[^>]*required=""/);
    expect(html).toContain('type="email"');
  });
  it('gives every text-entry control 16px text and at least 44px height', () => {
    const controls = html.match(/<(?:input|select|textarea)\b[^>]*>/g) ?? [];
    expect(controls).toHaveLength(5);
    controls.forEach(control => {
      expect(control).toContain('text-[16px]');
      expect(control).toContain('min-h-[44px]');
    });
  });
  it('enlarges list/card view targets without changing their behavior', () => {
    const css = readFileSync('src/components/editorial-home.css', 'utf8');
    const rule = css.match(/\.editorial-view-toggle button \{[^}]+\}/)?.[0] ?? '';
    expect(rule).toContain('min-width: 44px');
    expect(rule).toContain('min-height: 44px');
  });
});
