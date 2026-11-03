import { TestBed } from '@angular/core/testing';
import { AuthSessionService } from '@invest/auth-security';
import { App } from './app';
import { appConfig } from './app.config';

describe('App (shell)', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: appConfig.providers,
    }).compileComponents();
  });

  it('renderiza toolbar corporativa, sidenav e o chip do perfil', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('mat-toolbar')?.textContent).toContain('Stellar Banking');
    expect(element.querySelector('mat-sidenav')?.textContent).toContain('Renda Fixa e Fundos');
    expect(element.textContent).toContain('Carlos Menezes');
  });

  it('alterna o tema e aplica data-theme no <html>', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const toggle = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Ativar tema escuro"]',
    );
    toggle?.click();
    await fixture.whenStable();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    document.documentElement.setAttribute('data-theme', 'light');
  });

  it('exibe o item "Mesa Private" somente para o perfil Private (diretiva ACL no shell)', async () => {
    const session = TestBed.inject(AuthSessionService);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).not.toContain('Mesa Private habilitada');
    session.loginAs('PRIVATE_BANKING');
    await fixture.whenStable();
    expect(element.textContent).toContain('Mesa Private habilitada');
  });
});
