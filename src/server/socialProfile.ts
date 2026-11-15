import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import { resolveDataRoot } from './dataRoot.ts';
import {
  persistSocialProfileToNeon,
  persistSocialPostToNeon,
  deleteSocialPostFromNeon,
  persistSocialCommentToNeon,
  deleteSocialCommentFromNeon,
  persistStateSnapshotToNeon,
  persistSystemAssetToNeon,
  persistUserToNeon,
  flushPendingNeonWrites,
} from '../../neon.ts';
import type { SocialPost, SocialComment, UserSocialProfile, SocialLinks } from '../types/index.ts';

interface SocialStoreState {
  profiles: Record<string, UserSocialProfile>;
  posts: SocialPost[];
}

let activeSocialState: SocialStoreState | null = null;
export function hydrateSocialProfileFromPayload(payload: any): void {
  if (!activeSocialState || !payload || typeof payload !== 'object') return;
  if (payload.profiles && typeof payload.profiles === 'object') {
    activeSocialState.profiles = payload.profiles;
  }
  if (Array.isArray(payload.posts)) {
    activeSocialState.posts = payload.posts.map((p: any) => ({
      ...p,
      likes: Array.isArray(p?.likes) ? p.likes : [],
      congrats: Array.isArray(p?.congrats) ? p.congrats : [],
      comments: Array.isArray(p?.comments) ? p.comments : [],
    }));
  }
}

export function mergeSocialProfilesFromNeon(
  rows: Array<{
    userId: string;
    coverUrl?: string;
    bio?: string;
    customDisplayName?: string;
    phone?: string;
    location?: string;
    socialLinks?: SocialLinks;
    hiddenPhotos?: string[];
    updatedAt?: string;
  }>
): void {
  if (!activeSocialState || !Array.isArray(rows)) return;
  for (const row of rows) {
    if (!row || !row.userId) continue;
    const existing = activeSocialState.profiles[row.userId];
    if (!existing) {
      activeSocialState.profiles[row.userId] = {
        userId: row.userId,
        coverUrl: row.coverUrl || DEFAULT_COVER,
        bio: row.bio || '',
        customDisplayName: row.customDisplayName,
        phone: row.phone,
        location: row.location,
        socialLinks: row.socialLinks || {},
        hiddenPhotos: Array.isArray(row.hiddenPhotos) ? row.hiddenPhotos : [],
        updatedAt: row.updatedAt || new Date().toISOString(),
      };
      continue;
    }

    const rowTs = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
    const existingTs = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
    const rowIsNewer = rowTs > existingTs;

    if (
      row.coverUrl &&
      row.coverUrl !== DEFAULT_COVER &&
      (!existing.coverUrl || existing.coverUrl === DEFAULT_COVER || rowIsNewer)
    ) {
      existing.coverUrl = row.coverUrl;
    }
    if (rowIsNewer) {
      if (row.bio !== undefined) existing.bio = row.bio;
      if (row.customDisplayName !== undefined) existing.customDisplayName = row.customDisplayName;
      if (row.phone !== undefined) existing.phone = row.phone;
      if (row.location !== undefined) existing.location = row.location;
      if (row.socialLinks) existing.socialLinks = row.socialLinks;
      if (Array.isArray(row.hiddenPhotos)) existing.hiddenPhotos = row.hiddenPhotos;
      if (row.updatedAt) existing.updatedAt = row.updatedAt;
    }
  }
}

export function mergeSocialPostsFromNeon(neonPosts: SocialPost[]): void {
  if (!activeSocialState || !Array.isArray(neonPosts) || neonPosts.length === 0) return;
  const byId = new Map<string, SocialPost>();
  for (const p of activeSocialState.posts) {
    if (p && p.id) {
      byId.set(p.id, {
        ...p,
        likes: Array.isArray(p.likes) ? p.likes : [],
        congrats: Array.isArray(p.congrats) ? p.congrats : [],
        comments: Array.isArray(p.comments) ? p.comments : [],
      });
    }
  }
  for (const np of neonPosts) {
    if (!np || !np.id) continue;
    const existing = byId.get(np.id);
    if (!existing) {
      byId.set(np.id, {
        ...np,
        likes: Array.isArray(np.likes) ? np.likes : [],
        congrats: Array.isArray(np.congrats) ? np.congrats : [],
        comments: Array.isArray(np.comments) ? np.comments : [],
      });
    } else {
      const npTs = np.updatedAt ? new Date(np.updatedAt).getTime() : 0;
      const exTs = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      if (npTs > exTs) {
        byId.set(np.id, {
          ...existing,
          ...np,
          likes: Array.isArray(np.likes) ? np.likes : existing.likes || [],
          congrats: Array.isArray(np.congrats) ? np.congrats : existing.congrats || [],
          comments:
            Array.isArray(np.comments) && np.comments.length >= (existing.comments || []).length
              ? np.comments
              : existing.comments || [],
        });
      }
    }
  }
  activeSocialState.posts = Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getSocialCoverUrlForUser(userId: string): string | undefined {
  if (!activeSocialState || !userId) return undefined;
  const cover = activeSocialState.profiles[userId]?.coverUrl;
  return cover && cover.trim() !== '' ? cover : undefined;
}

const DEFAULT_COVER = '/assets/banner-rodovar-conecta-highway.png';

const INITIAL_SAMPLE_POSTS: SocialPost[] = [
  {
    id: 'post-init-1',
    authorId: 'emp-admin-master',
    authorName: 'Carlos Mendes',
    authorAvatar: '/assets/avatar-joao.jpg',
    authorRole: 'Comercial',
    authorDepartment: 'Comercial',
    content:
      'Mais uma negociação concluída com sucesso! 🚛 Novo contrato de transporte para a região Sul. Seguimos firmes, levando resultados e fortalecendo parcerias! 💛',
    images: [
      '/assets/aistudio/Banner_Rodovar_Conecta_na_Rodovia_24f668fa.png',
      '/assets/aistudio/010203_5a4289e5.png',
      '/assets/aistudio/image_58f528e8.png',
    ],
    likes: [
      'emp-admin-master',
      'emp-vitor-diretoria',
      'emp-monica-comercial',
      'emp-priscila-expedicao',
    ],
    comments: [
      {
        id: 'c-1',
        postId: 'post-init-1',
        authorId: 'emp-vitor-diretoria',
        authorName: 'Vitor Hugo',
        authorAvatar: '/assets/aistudio/RODOVAR-LOGO_310056c8.png',
        authorRole: 'Diretoria',
        content: 'Excelente trabalho, time Comercial! O compromisso com a excelência faz a diferença.',
        createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      },
      {
        id: 'c-2',
        postId: 'post-init-1',
        authorId: 'emp-monica-comercial',
        authorName: 'Mônica Nery',
        authorAvatar: '/assets/aistudio/RODOVAR-LOGO_310056c8.png',
        authorRole: 'Comercial',
        content: 'Orgulho de fazer parte dessa equipe! Vamos por mais resultados juntos!',
        createdAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
      },
    ],
    commentsCount: 2,
    audience: 'Comercial',
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
  {
    id: 'post-init-2',
    authorId: 'emp-admin-master',
    authorName: 'Carlos Mendes',
    authorAvatar: '/assets/avatar-joao.jpg',
    authorRole: 'Comercial',
    authorDepartment: 'Comercial',
    content:
      'Alinhamento com a equipe de Logística e Monitoramento sobre as novas rotas do Corredor Nordeste. Rastreabilidade e segurança máxima do início ao fim!',
    images: [
      '/assets/aistudio/DSC00410_9423424f.JPG',
      '/assets/aistudio/image_47dbceb5.png',
    ],
    likes: ['emp-admin-master', 'emp-jairo-monitoramento'],
    comments: [],
    commentsCount: 0,
    audience: 'Público',
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  },
];

export function registerSocialProfileRoutes(app: Express, guard: any, dbState: any) {
  const dataDir = path.join(resolveDataRoot(), 'data');
  const uploadsDir = path.join(resolveDataRoot(), 'public', 'uploads');
  const socialStoreFile = path.join(dataDir, 'social-store.json');

  let state: SocialStoreState = {
    profiles: {},
    posts: [...INITIAL_SAMPLE_POSTS],
  };

  if (fs.existsSync(socialStoreFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(socialStoreFile, 'utf8'));
      if (raw && typeof raw === 'object') {
        state.profiles = raw.profiles || {};
        state.posts = Array.isArray(raw.posts) ? raw.posts : [...INITIAL_SAMPLE_POSTS];
      }
    } catch (e) {
      console.warn('Failed to parse social-store.json:', (e as Error).message);
    }
  }
  activeSocialState = state;

  const persistStateLocal = () => {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(socialStoreFile, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      console.warn('Social state save error:', (err as Error).message);
    }
  };

  const persistState = () => {
    persistStateLocal();
    void persistStateSnapshotToNeon('rodovar-social', {
      profiles: state.profiles,
      posts: state.posts,
      updatedAt: new Date().toISOString(),
    });
  };

  const persistStateAsync = async () => {
    persistStateLocal();
    await persistStateSnapshotToNeon('rodovar-social', {
      profiles: state.profiles,
      posts: state.posts,
      updatedAt: new Date().toISOString(),
    }).catch((err) => {
      console.warn('Social state Neon snapshot error:', (err as Error).message);
    });
  };

  const resolveLiveAvatar = (user: any, fallbackAvatar?: string) => {
    if (
      user?.hasCustomAvatar &&
      user?.avatar &&
      String(user.avatar).trim() !== '' &&
      !String(user.avatar).includes('default-avatar.png')
    ) {
      return String(user.avatar).trim();
    }
    return fallbackAvatar && !fallbackAvatar.includes('avatar-joao')
      ? fallbackAvatar
      : '/assets/default-avatar.png';
  };

  const enrichPostForClient = (p: SocialPost): SocialPost => {
    const authorUser = dbState?.users?.find((u: any) => u.id === p.authorId);
    const authorSocial = state.profiles[p.authorId];
    const enrichedComments = (p.comments || []).map((c) => {
      const cUser = dbState?.users?.find((u: any) => u.id === c.authorId);
      const cSocial = state.profiles[c.authorId];
      return {
        ...c,
        authorName: cSocial?.customDisplayName || cUser?.name || c.authorName,
        authorAvatar: cUser ? resolveLiveAvatar(cUser, c.authorAvatar) : c.authorAvatar || '/assets/default-avatar.png',
      };
    });
    return {
      ...p,
      authorName: authorSocial?.customDisplayName || authorUser?.name || p.authorName,
      authorAvatar: authorUser
        ? resolveLiveAvatar(authorUser, p.authorAvatar)
        : p.authorAvatar || '/assets/default-avatar.png',
      authorRole: authorUser?.roleTitle || p.authorRole,
      authorDepartment: authorUser?.department || p.authorDepartment,
      likes: Array.isArray(p.likes) ? p.likes : [],
      congrats: Array.isArray(p.congrats) ? p.congrats : [],
      comments: enrichedComments,
      commentsCount: enrichedComments.length,
    };
  };

  const getOrCreateProfile = (userId: string, defaultUser?: any): UserSocialProfile => {
    if (!state.profiles[userId]) {
      const user = defaultUser || dbState.users.find((u: any) => u.id === userId);
      const isCarlos = user?.name?.toLowerCase().includes('carlos') || user?.login?.includes('carlos') || user?.id === 'emp-admin-master';

      state.profiles[userId] = {
        userId,
        coverUrl: DEFAULT_COVER,
        bio: isCarlos
          ? 'Profissional da área comercial, apaixonado por logística, transporte e conexão de pessoas. Comprometido com resultados, atendimento de qualidade e o crescimento da RODOVAR.'
          : `Colaborador dedicado do setor de ${user?.department || 'Operações'} da RODOVAR Transportes. Comprometido com eficiência, segurança e excelência.`,
        customDisplayName: user?.name,
        phone: user?.phoneExt || user?.phone || '(71) 9 9920-2476',
        location: user?.location || 'Salvador – BA',
        socialLinks: isCarlos
          ? {
              instagram: 'https://instagram.com/carlos.mendes_rodovar',
              linkedin: 'https://linkedin.com/in/carlosmendes',
              facebook: 'https://facebook.com/carlos.mendes',
              youtube: 'https://youtube.com/@CarlosMendes',
              tiktok: 'https://tiktok.com/@carlos.mendes',
              website: 'https://rodovar.com.br',
            }
          : {
              instagram: '',
              linkedin: '',
              facebook: '',
              youtube: '',
              tiktok: '',
              website: 'https://rodovar.com.br',
            },
        updatedAt: new Date().toISOString(),
      };
      persistState();
      void persistSocialProfileToNeon(state.profiles[userId]);
    }
    return state.profiles[userId];
  };

  // 1. GET /api/profile/social/:userId? - Get social profile + photos
  app.get('/api/profile/social/:userId?', guard, (req: any, res) => {
    const sessionUser = req.sessionUser;
    const targetUserId = req.params.userId || sessionUser.id;
    const targetUser = dbState.users.find((u: any) => u.id === targetUserId) || sessionUser;

    const profile = getOrCreateProfile(targetUserId, targetUser);
    const userPosts = state.posts.filter((p) => p.authorId === targetUserId);

    // Collect all unique photos from user posts
    const hiddenSet = new Set(Array.isArray(profile.hiddenPhotos) ? profile.hiddenPhotos : []);
    const photos: string[] = [];
    userPosts.forEach((p) => {
      if (Array.isArray(p.images)) {
        p.images.forEach((img) => {
          if (img && !hiddenSet.has(img) && !photos.includes(img)) photos.push(img);
        });
      }
    });

    // Add extra sample portfolio photos if fewer than 6
    const stockPhotos = [
      '/assets/aistudio/Banner_Rodovar_Conecta_na_Rodovia_24f668fa.png',
      '/assets/aistudio/010203_5a4289e5.png',
      '/assets/aistudio/image_58f528e8.png',
      '/assets/aistudio/DSC00410_9423424f.JPG',
      '/assets/aistudio/image_47dbceb5.png',
      '/assets/aistudio/DSC00515_18c5e319.JPG',
      '/assets/aistudio/image_4dcd4767.png',
      '/assets/aistudio/image_0137ac6c.png',
    ];
    stockPhotos.forEach((sp) => {
      if (photos.length < 8 && !hiddenSet.has(sp) && !photos.includes(sp)) {
        photos.push(sp);
      }
    });

    res.json({
      ok: true,
      profile,
      user: {
        id: targetUser.id,
        name: profile.customDisplayName || targetUser.name,
        login: targetUser.login,
        email: targetUser.email,
        roleTitle: targetUser.roleTitle,
        department: targetUser.department,
        accessLevel: targetUser.accessLevel,
        avatar: resolveLiveAvatar(targetUser),
        hasCustomAvatar: Boolean(targetUser.hasCustomAvatar),
        coverUrl: profile.coverUrl || targetUser.coverUrl || DEFAULT_COVER,
        phoneExt: profile.phone || targetUser.phoneExt,
        location: profile.location || 'Salvador – BA',
        joinedAt: targetUser.joinedAt,
        active: targetUser.active,
      },
      postsCount: userPosts.length,
      photos,
    });
  });

  // 2. PUT /api/profile/social - Update social profile
  app.put('/api/profile/social', guard, async (req: any, res) => {
    const sessionUser = req.sessionUser;
    const {
      bio,
      customDisplayName,
      phone,
      location,
      socialLinks,
      coverUrl,
      photos: nextPhotos,
      hiddenPhotos,
    } = req.body || {};

    const profile = getOrCreateProfile(sessionUser.id, sessionUser);

    if (typeof bio === 'string') profile.bio = bio.trim().slice(0, 1000);
    let syncedUserRecord: any = null;
    if (typeof customDisplayName === 'string' && customDisplayName.trim()) {
      profile.customDisplayName = customDisplayName.trim().slice(0, 150);
      // Synchronize with user object if applicable
      const u = dbState.users.find((user: any) => user.id === sessionUser.id);
      if (u) {
        u.name = profile.customDisplayName;
        syncedUserRecord = u;
      }
    }
    if (typeof phone === 'string') {
      profile.phone = phone.trim().slice(0, 50);
      const u = dbState.users.find((user: any) => user.id === sessionUser.id);
      if (u) {
        u.phoneExt = profile.phone;
        u.phone = profile.phone;
        syncedUserRecord = u;
      }
    }
    if (typeof location === 'string') profile.location = location.trim().slice(0, 100);
    if (typeof coverUrl === 'string' && coverUrl.trim()) {
      profile.coverUrl = coverUrl.trim();
      const u = dbState.users.find((user: any) => user.id === sessionUser.id);
      if (u) {
        u.coverUrl = profile.coverUrl;
        syncedUserRecord = u;
      }
    }

    if (Array.isArray(hiddenPhotos)) {
      profile.hiddenPhotos = hiddenPhotos.filter((item) => typeof item === 'string');
    } else if (Array.isArray(nextPhotos)) {
      const keepSet = new Set(nextPhotos.filter((item) => typeof item === 'string'));
      const currentKnown = new Set<string>([
        '/assets/aistudio/Banner_Rodovar_Conecta_na_Rodovia_24f668fa.png',
        '/assets/aistudio/010203_5a4289e5.png',
        '/assets/aistudio/image_58f528e8.png',
        '/assets/aistudio/DSC00410_9423424f.JPG',
        '/assets/aistudio/image_47dbceb5.png',
        '/assets/aistudio/DSC00515_18c5e319.JPG',
        '/assets/aistudio/image_4dcd4767.png',
        '/assets/aistudio/image_0137ac6c.png',
      ]);
      state.posts
        .filter((p) => p.authorId === sessionUser.id)
        .forEach((p) => (p.images || []).forEach((img) => currentKnown.add(img)));
      const mergedHidden = new Set(Array.isArray(profile.hiddenPhotos) ? profile.hiddenPhotos : []);
      currentKnown.forEach((img) => {
        if (!keepSet.has(img)) mergedHidden.add(img);
        else mergedHidden.delete(img);
      });
      profile.hiddenPhotos = Array.from(mergedHidden);
    }

    if (socialLinks && typeof socialLinks === 'object') {
      const cleanUrl = (val: string | undefined): string => {
        const str = String(val || '').trim();
        if (!str) return '';
        if (str.startsWith('http://') || str.startsWith('https://')) return str;
        if (str.startsWith('@')) return `https://instagram.com/${str.slice(1)}`;
        return `https://${str}`;
      };

      profile.socialLinks = {
        instagram: cleanUrl(socialLinks.instagram),
        linkedin: cleanUrl(socialLinks.linkedin),
        facebook: cleanUrl(socialLinks.facebook),
        youtube: cleanUrl(socialLinks.youtube),
        tiktok: cleanUrl(socialLinks.tiktok),
        website: cleanUrl(socialLinks.website),
      };
    }

    profile.updatedAt = new Date().toISOString();
    await persistStateAsync();
    await persistSocialProfileToNeon(profile).catch(() => {});
    if (syncedUserRecord) {
      await persistUserToNeon(syncedUserRecord).catch(() => {});
    }
    await flushPendingNeonWrites();

    res.json({
      ok: true,
      profile,
    });
  });

function validateSocialImageBuffer(
  buf: Buffer
): { valid: boolean; mimeType?: string; ext?: string; error?: string } {
  if (!buf || buf.length < 12) {
    return { valid: false, error: 'Arquivo de imagem vazio ou corrompido.' };
  }
  if (buf.length > 5 * 1024 * 1024) {
    return { valid: false, error: 'A imagem excede o limite de 5 MB.' };
  }
  const headAscii = buf.subarray(0, Math.min(buf.length, 256)).toString('utf8').toLowerCase();
  if (
    headAscii.includes('<svg') ||
    headAscii.includes('<?xml') ||
    headAscii.includes('<script') ||
    headAscii.includes('<html')
  ) {
    return { valid: false, error: 'Imagens SVG ou conteúdo ativo não são permitidos.' };
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { valid: true, mimeType: 'image/png', ext: 'png' };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { valid: true, mimeType: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { valid: true, mimeType: 'image/webp', ext: 'webp' };
  }
  const gifSig = buf.subarray(0, 6).toString('ascii');
  if (gifSig === 'GIF87a' || gifSig === 'GIF89a') {
    return { valid: true, mimeType: 'image/gif', ext: 'gif' };
  }
  if (buf[0] === 0x42 && buf[1] === 0x4d && buf.length >= 26) {
    return { valid: true, mimeType: 'image/bmp', ext: 'bmp' };
  }
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii');
    if (brand.includes('avi') || brand.includes('mif') || brand.includes('heic') || brand.includes('msf')) {
      return { valid: true, mimeType: 'image/avif', ext: 'avif' };
    }
  }
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) {
    return { valid: true, mimeType: 'image/x-icon', ext: 'ico' };
  }
  return { valid: false, error: 'Formato de imagem inválido. Envie PNG, JPG, WebP, GIF, BMP, AVIF ou ICO.' };
}

  // 3. POST /api/profile/cover - Upload cover image
  app.post('/api/profile/cover', guard, async (req: any, res) => {
    const sessionUser = req.sessionUser;
    const { dataUrl, imageUrl } = req.body || {};

    let targetCoverUrl =
      typeof imageUrl === 'string' &&
      (imageUrl.startsWith('/uploads/') || imageUrl.startsWith('/assets/'))
        ? imageUrl
        : undefined;

    if (dataUrl && typeof dataUrl === 'string') {
      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (!matches) {
        return res.status(400).json({ error: 'Formato de imagem inválido.' });
      }
      const buffer = Buffer.from(matches[2], 'base64');
      const check = validateSocialImageBuffer(buffer);
      if (!check.valid || !check.mimeType || !check.ext) {
        return res.status(400).json({ error: check.error || 'Imagem inválida.' });
      }
      const fileName = `cover-${sessionUser.id}-${Date.now()}.${check.ext}`;
      const filePath = path.join(uploadsDir, fileName);
      try {
        fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(filePath, buffer);
      } catch {
        // serverless fallback handled by Neon asset persistence below
      }
      await persistSystemAssetToNeon({
        id: fileName,
        slot: 'social-cover',
        mimeType: check.mimeType,
        dataBase64: buffer.toString('base64'),
      });
      targetCoverUrl = `/uploads/${fileName}`;
    }

    if (!targetCoverUrl) {
      return res.status(400).json({ error: 'Nenhuma imagem válida enviada.' });
    }

    const profile = getOrCreateProfile(sessionUser.id, sessionUser);
    const previousCoverUrl = profile.coverUrl;
    if (
      previousCoverUrl &&
      previousCoverUrl !== targetCoverUrl &&
      previousCoverUrl.startsWith('/uploads/cover-')
    ) {
      try {
        const prevPath = path.join(uploadsDir, path.basename(previousCoverUrl));
        if (fs.existsSync(prevPath)) fs.unlinkSync(prevPath);
      } catch {
        // ignore cleanup errors on read-only FS
      }
    }
    profile.coverUrl = targetCoverUrl;
    profile.updatedAt = new Date().toISOString();
    const userRecord = dbState?.users?.find((u: any) => u.id === sessionUser.id);
    if (userRecord) {
      userRecord.coverUrl = targetCoverUrl;
    }

    await persistStateAsync();
    await persistSocialProfileToNeon(profile).catch(() => {});
    if (userRecord) {
      await persistUserToNeon(userRecord).catch(() => {});
    }
    await flushPendingNeonWrites();

    res.json({
      ok: true,
      coverUrl: targetCoverUrl,
      profile,
    });
  });

  // 4. GET /api/profile/posts - List universal social posts (or filter by authorId if explicitly requested)
  app.get('/api/profile/posts', guard, (req: any, res) => {
    const { authorId } = req.query;
    let posts = state.posts.map(enrichPostForClient);
    if (authorId) {
      posts = posts.filter((p) => p.authorId === authorId);
    }
    posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({
      ok: true,
      posts,
    });
  });

  // 5. POST /api/profile/posts - Create new post
  app.post('/api/profile/posts', guard, async (req: any, res) => {
    const sessionUser = req.sessionUser;
    const { content, images, audience } = req.body || {};

    if (!content && (!Array.isArray(images) || images.length === 0)) {
      return res.status(400).json({ error: 'A publicação não pode estar vazia.' });
    }

    const cleanContent = String(content || '').trim().slice(0, 3000);
    const validImages: string[] = [];

    if (Array.isArray(images)) {
      for (const img of images.slice(0, 10)) {
        if (typeof img === 'string') {
          if (img.startsWith('data:')) {
            const matches = img.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
            if (!matches) {
              return res.status(400).json({ error: 'Uma das imagens enviadas possui formato inválido.' });
            }
            const buffer = Buffer.from(matches[2], 'base64');
            const check = validateSocialImageBuffer(buffer);
            if (!check.valid || !check.mimeType || !check.ext) {
              return res.status(400).json({ error: check.error || 'Imagem inválida.' });
            }
            const fileName = `post-img-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${check.ext}`;
            try {
              fs.mkdirSync(uploadsDir, { recursive: true });
              fs.writeFileSync(path.join(uploadsDir, fileName), buffer);
            } catch {
              // serverless fallback handled by Neon asset persistence below
            }
            await persistSystemAssetToNeon({
              id: fileName,
              slot: 'social-post',
              mimeType: check.mimeType,
              dataBase64: buffer.toString('base64'),
            });
            validImages.push(`/uploads/${fileName}`);
          } else if (img.startsWith('/uploads/') || img.startsWith('/assets/')) {
            validImages.push(img);
          }
        }
      }
    }

    const profile = getOrCreateProfile(sessionUser.id, sessionUser);
    const newPost: SocialPost = {
      id: `post-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      authorId: sessionUser.id,
      authorName: profile.customDisplayName || sessionUser.name,
      authorAvatar: resolveLiveAvatar(sessionUser),
      authorRole: sessionUser.roleTitle || 'Colaborador',
      authorDepartment: sessionUser.department || 'Geral',
      content: cleanContent,
      images: validImages,
      likes: [],
      congrats: [],
      comments: [],
      commentsCount: 0,
      audience: audience || 'Público',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    state.posts.unshift(newPost);
    await persistStateAsync();
    await persistSocialPostToNeon(newPost);
    await flushPendingNeonWrites();

    res.status(201).json({
      ok: true,
      post: enrichPostForClient(newPost),
    });
  });

  // 6. PUT /api/profile/posts/:postId - Edit post
  app.put('/api/profile/posts/:postId', guard, async (req: any, res) => {
    const sessionUser = req.sessionUser;
    const { postId } = req.params;
    const { content, images, audience } = req.body || {};

    const post = state.posts.find((p) => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Publicação não encontrada.' });
    }

    if (post.authorId !== sessionUser.id && sessionUser.accessLevel !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Sem permissão para editar esta publicação.' });
    }

    if (typeof content === 'string') {
      post.content = content.trim().slice(0, 3000);
    }
    if (Array.isArray(images)) {
      post.images = images.filter((img) => typeof img === 'string');
    }
    if (typeof audience === 'string') {
      post.audience = audience;
    }
    post.updatedAt = new Date().toISOString();

    await persistStateAsync();
    await persistSocialPostToNeon(post);
    await flushPendingNeonWrites();

    res.json({
      ok: true,
      post: enrichPostForClient(post),
    });
  });

  // 7. DELETE /api/profile/posts/:postId - Delete post
  app.delete('/api/profile/posts/:postId', guard, async (req: any, res) => {
    const sessionUser = req.sessionUser;
    const { postId } = req.params;

    const postIndex = state.posts.findIndex((p) => p.id === postId);
    if (postIndex === -1) {
      return res.status(404).json({ error: 'Publicação não encontrada.' });
    }

    const post = state.posts[postIndex];
    if (post.authorId !== sessionUser.id && sessionUser.accessLevel !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Sem permissão para excluir esta publicação.' });
    }

    state.posts.splice(postIndex, 1);
    await persistStateAsync();
    await deleteSocialPostFromNeon(postId);
    await flushPendingNeonWrites();

    res.json({
      ok: true,
      deletedPostId: postId,
    });
  });

  // 8. POST /api/profile/posts/:postId/like - Toggle like
  app.post('/api/profile/posts/:postId/like', guard, async (req: any, res) => {
    const sessionUser = req.sessionUser;
    const { postId } = req.params;

    const post = state.posts.find((p) => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Publicação não encontrada.' });
    }

    post.likes ||= [];
    const userId = sessionUser.id;
    const existingIndex = post.likes.indexOf(userId);
    let isLiked = false;

    if (existingIndex >= 0) {
      post.likes.splice(existingIndex, 1);
      isLiked = false;
    } else {
      post.likes.push(userId);
      isLiked = true;
    }
    post.updatedAt = new Date().toISOString();

    await persistStateAsync();
    await persistSocialPostToNeon(post);
    await flushPendingNeonWrites();

    res.json({
      ok: true,
      isLiked,
      likesCount: post.likes.length,
      likes: post.likes,
    });
  });

  // 8b. POST /api/profile/posts/:postId/congrats - Toggle Parabéns reaction
  app.post('/api/profile/posts/:postId/congrats', guard, async (req: any, res) => {
    const sessionUser = req.sessionUser;
    const { postId } = req.params;

    const post = state.posts.find((p) => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Publicação não encontrada.' });
    }

    post.congrats ||= [];
    const userId = sessionUser.id;
    const existingIndex = post.congrats.indexOf(userId);
    let isCongratulated = false;

    if (existingIndex >= 0) {
      post.congrats.splice(existingIndex, 1);
      isCongratulated = false;
    } else {
      post.congrats.push(userId);
      isCongratulated = true;
    }
    post.updatedAt = new Date().toISOString();

    await persistStateAsync();
    await persistSocialPostToNeon(post);
    await flushPendingNeonWrites();

    res.json({
      ok: true,
      isCongratulated,
      congratsCount: post.congrats.length,
      congrats: post.congrats,
    });
  });

  // 9. POST /api/profile/posts/:postId/comments - Add comment
  app.post('/api/profile/posts/:postId/comments', guard, async (req: any, res) => {
    const sessionUser = req.sessionUser;
    const { postId } = req.params;
    const { content } = req.body || {};

    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'Comentário não pode estar vazio.' });
    }

    const post = state.posts.find((p) => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Publicação não encontrada.' });
    }

    const profile = getOrCreateProfile(sessionUser.id, sessionUser);
    const newComment: SocialComment = {
      id: `comment-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      postId,
      authorId: sessionUser.id,
      authorName: profile.customDisplayName || sessionUser.name,
      authorAvatar: resolveLiveAvatar(sessionUser),
      authorRole: sessionUser.roleTitle || 'Colaborador',
      content: String(content).trim().slice(0, 1000),
      createdAt: new Date().toISOString(),
    };

    post.comments ||= [];
    post.comments.push(newComment);
    post.commentsCount = post.comments.length;
    post.updatedAt = new Date().toISOString();

    await persistStateAsync();
    await persistSocialCommentToNeon(newComment);
    await persistSocialPostToNeon(post);
    await flushPendingNeonWrites();

    res.status(201).json({
      ok: true,
      comment: newComment,
      commentsCount: post.commentsCount,
    });
  });

  // 10. DELETE /api/profile/posts/:postId/comments/:commentId - Delete comment
  app.delete('/api/profile/posts/:postId/comments/:commentId', guard, async (req: any, res) => {
    const sessionUser = req.sessionUser;
    const { postId, commentId } = req.params;

    const post = state.posts.find((p) => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Publicação não encontrada.' });
    }

    const commentIndex = (post.comments || []).findIndex((c) => c.id === commentId);
    if (commentIndex === -1) {
      return res.status(404).json({ error: 'Comentário não encontrado.' });
    }

    const comment = post.comments[commentIndex];
    if (
      comment.authorId !== sessionUser.id &&
      post.authorId !== sessionUser.id &&
      sessionUser.accessLevel !== 'ADMINISTRADOR'
    ) {
      return res.status(403).json({ error: 'Sem permissão para excluir este comentário.' });
    }

    post.comments.splice(commentIndex, 1);
    post.commentsCount = post.comments.length;
    post.updatedAt = new Date().toISOString();

    await persistStateAsync();
    await deleteSocialCommentFromNeon(commentId);
    await persistSocialPostToNeon(post);
    await flushPendingNeonWrites();

    res.json({
      ok: true,
      commentsCount: post.commentsCount,
    });
  });
}
