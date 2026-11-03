import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

/** @description Temas suportados. */
export type ThemeName = 'light' | 'dark';

/** @description Chave de persistência da preferência (prefixo próprio: sobrevive ao logout). */
const THEME_STORAGE_KEY = 'stellar.theme';

/**
 * @description Serviço de tema (claro/escuro) do Design System. O tema é aplicado como atributo
 * `data-theme` no `<html>`; os Design Tokens CSS (`--inv-*`) e o `color-scheme` do Material reagem
 * a ele — nenhum componente precisa conhecer o tema atual.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly state = signal<ThemeName>(this.readPreference());

  /** Tema corrente (somente leitura). */
  readonly theme = this.state.asReadonly();

  /**
   * @description Registra o `effect` que sincroniza o signal com o atributo do `<html>` e o storage.
   */
  constructor() {
    effect(() => {
      const theme = this.state();
      this.document.documentElement.setAttribute('data-theme', theme);
      try {
        this.document.defaultView?.localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // Storage pode estar bloqueado (modo privado): a preferência simplesmente não persiste.
      }
    });
  }

  /**
   * @description Define o tema.
   * @param theme Tema desejado.
   * @example
   * theme.set('dark');
   */
  set(theme: ThemeName): void {
    this.state.set(theme);
  }

  /**
   * @description Alterna entre claro e escuro.
   * @example
   * theme.toggle();
   */
  toggle(): void {
    this.state.update((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  /**
   * @description Lê a preferência persistida (padrão: claro).
   * @returns Tema salvo ou `'light'`.
   */
  private readPreference(): ThemeName {
    try {
      const stored = this.document.defaultView?.localStorage.getItem(THEME_STORAGE_KEY);
      return stored === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }
}
