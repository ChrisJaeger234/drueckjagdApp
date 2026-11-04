import { describe, expect, it } from 'vitest';
import { buildCsp, MAP_HOSTS } from './csp';

const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

describe('Content-Security-Policy', () => {
  it('erlaubt nur Supabase und die Kartendienste', () => {
    const csp = buildCsp('https://abc.supabase.co');
    expect(directive(csp, 'connect-src')).toBe(`connect-src 'self' https://abc.supabase.co wss://abc.supabase.co ${MAP_HOSTS.join(' ')}`);
    expect(directive(csp, 'img-src')).toContain('https://abc.supabase.co');
    expect(directive(csp, 'img-src')).not.toContain('wss:');
  });

  it('verbietet fremde und eingebettete Skripte', () => {
    const csp = buildCsp('https://abc.supabase.co');
    expect(directive(csp, 'script-src')).toBe("script-src 'self'");
    expect(csp).not.toContain('unsafe-eval');
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'");
  });

  it('nutzt ws: für einen lokalen Stack und übersteht eine fehlende URL', () => {
    expect(directive(buildCsp('http://127.0.0.1:54321'), 'connect-src')).toContain('ws://127.0.0.1:54321');
    expect(directive(buildCsp(''), 'connect-src')).toBe(`connect-src 'self' ${MAP_HOSTS.join(' ')}`);
  });
});
