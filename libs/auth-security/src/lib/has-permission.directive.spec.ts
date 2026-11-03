import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Permission } from './auth.models';
import { AuthSessionService } from './auth-session.service';
import { HasPermissionDirective } from './has-permission.directive';

@Component({
  imports: [HasPermissionDirective],
  template: `
    <button *hasPermission="permission(); scope: 'PRIVATE_BANKING'; else semAcesso" id="invest">Investir Agora</button>
    <ng-template #semAcesso><span id="denied">Sem acesso</span></ng-template>
  `,
})
class HostComponent {
  readonly permission = signal<Permission>('INVESTMENT_EXECUTE');
}

describe('HasPermissionDirective', () => {
  beforeEach(() => sessionStorage.clear());

  /** Cria o host e aguarda o `effect` da diretiva renderizar. */
  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('remove o botão do DOM para o perfil Varejo e exibe o template alternativo', async () => {
    TestBed.inject(AuthSessionService).loginAs('RETAIL');
    const element = await render();
    expect(element.querySelector('#invest')).toBeNull();
    expect(element.querySelector('#denied')).not.toBeNull();
  });

  it('renderiza o botão para Private Banking', async () => {
    TestBed.inject(AuthSessionService).loginAs('PRIVATE_BANKING');
    const element = await render();
    expect(element.querySelector('#invest')).not.toBeNull();
    expect(element.querySelector('#denied')).toBeNull();
  });

  it('reage reativamente à troca de perfil (Signals)', async () => {
    const session = TestBed.inject(AuthSessionService);
    session.loginAs('RETAIL');
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#invest')).toBeNull();

    session.loginAs('PRIVATE_BANKING');
    await fixture.whenStable();
    expect(element.querySelector('#invest')).not.toBeNull();

    session.logout('USER_REQUEST');
    await fixture.whenStable();
    expect(element.querySelector('#invest')).toBeNull();
  });

  it('esconde o elemento quando a permissão não existe para o perfil', async () => {
    TestBed.inject(AuthSessionService).loginAs('PRIVATE_BANKING');
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.permission.set('FUNDS_READ');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('#invest')).not.toBeNull();
  });
});
