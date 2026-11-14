import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  UserProfileMenu,
  getUserInitials,
  resolveAccessProfileLabel,
} from '../src/components/UserProfileMenu';
import { hasPagePermission } from '../src/lib/permissions';
import { resolveAvatarUrl } from '../src/lib/serverApi';
import type { Employee } from '../src/types';

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-test-1',
    name: 'Maria Clara Souza',
    login: 'maria.souza',
    email: 'maria.souza@rodovar.com.br',
    roleTitle: 'Analista Financeira',
    department: 'Financeiro',
    accessLevel: 'FUNCIONARIO',
    accessProfile: 'FINANCEIRO',
    avatar: '/assets/default-avatar.png',
    hasCustomAvatar: false,
    active: true,
    approvalStatus: 'APROVADO',
    phoneExt: '71 99920-2476',
    joinedAt: '10/02/2025',
    ...overrides,
  };
}

test('getUserInitials extrai iniciais corretas para nomes simples, compostos e vazios', () => {
  assert.equal(getUserInitials('Maria Clara Souza'), 'MS');
  assert.equal(getUserInitials('João'), 'JO');
  assert.equal(getUserInitials('  Carlos Eduardo  '), 'CE');
  assert.equal(getUserInitials(''), 'RD');
  assert.equal(getUserInitials(undefined), 'RD');
});

test('resolveAccessProfileLabel reconhece todos os 8 perfis institucionais do RODOVAR CONECTA', () => {
  assert.equal(
    resolveAccessProfileLabel(makeEmployee({ accessLevel: 'ADMINISTRADOR', accessProfile: null, department: 'Diretoria' })),
    'Administrador'
  );
  assert.equal(
    resolveAccessProfileLabel(makeEmployee({ accessProfile: 'DIRETORIA', accessLevel: 'DIRETORIA', department: 'Diretoria' })),
    'Diretoria'
  );
  assert.equal(
    resolveAccessProfileLabel(makeEmployee({ accessProfile: 'RH', department: 'Recursos Humanos' })),
    'RH'
  );
  assert.equal(
    resolveAccessProfileLabel(makeEmployee({ accessProfile: 'FINANCEIRO', department: 'Financeiro' })),
    'Financeiro'
  );
  assert.equal(
    resolveAccessProfileLabel(makeEmployee({ accessProfile: 'COMERCIAL', department: 'Comercial' })),
    'Comercial'
  );
  assert.equal(
    resolveAccessProfileLabel(makeEmployee({ accessProfile: 'EXPEDICAO', department: 'Expedição' })),
    'Expedição'
  );
  assert.equal(
    resolveAccessProfileLabel(makeEmployee({ accessProfile: 'MONITORAMENTO', department: 'Monitoramento' })),
    'Monitoramento'
  );
  assert.equal(
    resolveAccessProfileLabel(makeEmployee({ accessProfile: null, department: 'Administrativo' })),
    'Administrativo'
  );
});

test('permissões de administração: liberada somente ao perfil Administrador', () => {
  const admin = makeEmployee({ accessLevel: 'ADMINISTRADOR', accessProfile: null });
  assert.equal(hasPagePermission(admin, 'administracao'), true);

  const nonAdmins: Array<Partial<Employee>> = [
    { accessLevel: 'DIRETORIA', accessProfile: 'DIRETORIA', department: 'Diretoria' },
    { accessProfile: 'RH', department: 'Recursos Humanos' },
    { accessProfile: 'FINANCEIRO', department: 'Financeiro' },
    { accessProfile: 'COMERCIAL', department: 'Comercial' },
    { accessProfile: 'EXPEDICAO', department: 'Expedição' },
    { accessProfile: 'MONITORAMENTO', department: 'Monitoramento' },
    { accessProfile: null, department: 'Administrativo' },
  ];

  for (const profile of nonAdmins) {
    assert.equal(hasPagePermission(makeEmployee(profile), 'administracao'), false);
  }
  assert.equal(hasPagePermission(makeEmployee({ ...admin, active: false }), 'administracao'), false);
  assert.equal(hasPagePermission(makeEmployee({ ...admin, approvalStatus: 'SUSPENSO' }), 'administracao'), false);
});

test('resolveAvatarUrl preserva foto personalizada e aplica fallback padrão quando ausente', () => {
  const custom = makeEmployee({
    avatar: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    hasCustomAvatar: true,
  });
  assert.equal(resolveAvatarUrl(custom), 'data:image/jpeg;base64,/9j/4AAQSkZJRg==');

  const noCustom = makeEmployee({
    avatar: '/assets/default-avatar.png',
    hasCustomAvatar: false,
  });
  assert.match(resolveAvatarUrl(noCustom), /^\/assets\/default-avatar\.png/);
});

test('UserProfileMenu renderiza hierarquia real, iniciais/foto, badges e RBAC de Administração', () => {
  const noop = () => {};
  const adminUser = makeEmployee({
    id: 'emp-admin-master',
    name: 'Roberto Almeida',
    email: 'roberto.almeida@rodovar.com.br',
    roleTitle: 'Diretor de Tecnologia',
    department: 'Diretoria',
    accessLevel: 'ADMINISTRADOR',
    accessProfile: null,
    hasCustomAvatar: false,
  });

  const adminClosedHtml = renderToStaticMarkup(
    React.createElement(UserProfileMenu, {
      currentUser: adminUser,
      unreadNotificationsCount: 4,
      pendingAccessRequestsCount: 2,
      canAccessAdmin: true,
      isOpen: false,
      onToggle: noop,
      onClose: noop,
      onOpenProfile: noop,
      onOpenPreferences: noop,
      onOpenNotifications: noop,
      onOpenAdmin: noop,
      onLogout: noop,
    })
  );
  assert.match(adminClosedHtml, /aria-haspopup="menu"/);
  assert.match(adminClosedHtml, /aria-expanded="false"/);
  assert.match(adminClosedHtml, />RA</);
  assert.match(adminClosedHtml, /Roberto Almeida/);
  assert.doesNotMatch(adminClosedHtml, /role="menu"/);

  const adminOpenHtml = renderToStaticMarkup(
    React.createElement(UserProfileMenu, {
      currentUser: adminUser,
      unreadNotificationsCount: 7,
      pendingAccessRequestsCount: 3,
      canAccessAdmin: true,
      isOpen: true,
      onToggle: noop,
      onClose: noop,
      onOpenProfile: noop,
      onOpenPreferences: noop,
      onOpenNotifications: noop,
      onOpenAdmin: noop,
      onLogout: noop,
    })
  );
  assert.match(adminOpenHtml, /role="menu"/);
  assert.match(adminOpenHtml, /Roberto Almeida/);
  assert.match(adminOpenHtml, /Diretor de Tecnologia · Diretoria/);
  assert.match(adminOpenHtml, /roberto\.almeida@rodovar\.com\.br/);
  assert.match(adminOpenHtml, /Administrador/);
  assert.match(adminOpenHtml, /Sessão ativa/);
  assert.match(adminOpenHtml, /Meu Perfil/);
  assert.match(adminOpenHtml, /Preferências/);
  assert.match(adminOpenHtml, /Notificações/);
  assert.match(adminOpenHtml, />7</);
  assert.match(adminOpenHtml, /Administração/);
  assert.match(adminOpenHtml, />3</);
  assert.match(adminOpenHtml, /Sair da Conta/);

  const financeUser = makeEmployee({
    avatar: 'https://cdn.example.com/foto-maria.jpg',
    hasCustomAvatar: true,
  });
  const financeMobileOpenHtml = renderToStaticMarkup(
    React.createElement(UserProfileMenu, {
      variant: 'mobile',
      currentUser: financeUser,
      unreadNotificationsCount: 0,
      pendingAccessRequestsCount: 5,
      canAccessAdmin: false,
      isOpen: true,
      onToggle: noop,
      onClose: noop,
      onOpenProfile: noop,
      onOpenPreferences: noop,
      onOpenNotifications: noop,
      onOpenAdmin: noop,
      onLogout: noop,
    })
  );
  assert.match(financeMobileOpenHtml, /src="https:\/\/cdn\.example\.com\/foto-maria\.jpg"/);
  assert.match(financeMobileOpenHtml, /Financeiro/);
  assert.match(financeMobileOpenHtml, /Meu Perfil/);
  assert.match(financeMobileOpenHtml, /Preferências/);
  assert.match(financeMobileOpenHtml, /Notificações/);
  assert.match(financeMobileOpenHtml, /Sair da Conta/);
  assert.doesNotMatch(financeMobileOpenHtml, /Administração/);
});

test('servidor ativo protege sessão, perfil e rotas administrativas contra acesso não autenticado', async () => {
  const endpoints: Array<{ method: string; path: string }> = [
    { method: 'GET', path: '/api/auth/session' },
    { method: 'GET', path: '/api/admin/health' },
    { method: 'PUT', path: '/api/profile' },
    { method: 'PUT', path: '/api/profile/social' },
  ];

  for (const ep of endpoints) {
    const res = await fetch(`http://127.0.0.1:3000${ep.path}`, {
      method: ep.method,
      headers: ep.method === 'PUT' ? { 'Content-Type': 'application/json' } : undefined,
      body: ep.method === 'PUT' ? JSON.stringify({ name: 'Teste' }) : undefined,
    });
    assert.equal(res.status, 401, `${ep.method} ${ep.path} deve exigir sessão autenticada`);
  }
});
