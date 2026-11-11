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
} from '../../neon.ts';
import type { SocialPost, SocialComment, UserSocialProfile, SocialLinks } from '../types/index.ts';

interface SocialStoreState {
  profiles: Record<string, UserSocialProfile>;
  posts: SocialPost[];
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

  const persistState = () => {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(socialStoreFile, JSON.stringify(state, null, 2), 'utf8');
      void persistStateSnapshotToNeon('rodovar-social', {
        profilesCount: Object.keys(state.profiles).length,
        postsCount: state.posts.length,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Social state save error:', (err as Error).message);
    }
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
    const photos: string[] = [];
    userPosts.forEach((p) => {
      if (Array.isArray(p.images)) {
        p.images.forEach((img) => {
          if (img && !photos.includes(img)) photos.push(img);
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
      if (photos.length < 8 && !photos.includes(sp)) {
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
        avatar: targetUser.avatar || '/assets/avatar-joao.jpg',
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
  app.put('/api/profile/social', guard, (req: any, res) => {
    const sessionUser = req.sessionUser;
    const {
      bio,
      customDisplayName,
      phone,
      location,
      socialLinks,
      coverUrl,
    } = req.body || {};

    const profile = getOrCreateProfile(sessionUser.id, sessionUser);

    if (typeof bio === 'string') profile.bio = bio.trim().slice(0, 1000);
    if (typeof customDisplayName === 'string' && customDisplayName.trim()) {
      profile.customDisplayName = customDisplayName.trim().slice(0, 150);
      // Synchronize with user object if applicable
      const u = dbState.users.find((user: any) => user.id === sessionUser.id);
      if (u) u.name = profile.customDisplayName;
    }
    if (typeof phone === 'string') profile.phone = phone.trim().slice(0, 50);
    if (typeof location === 'string') profile.location = location.trim().slice(0, 100);
    if (typeof coverUrl === 'string' && coverUrl.trim()) profile.coverUrl = coverUrl.trim();

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
    persistState();
    void persistSocialProfileToNeon(profile);

    res.json({
      ok: true,
      profile,
    });
  });

  // 3. POST /api/profile/cover - Upload cover image
  app.post('/api/profile/cover', guard, (req: any, res) => {
    const sessionUser = req.sessionUser;
    const { dataUrl, imageUrl } = req.body || {};

    let targetCoverUrl = imageUrl;

    if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
      try {
        fs.mkdirSync(uploadsDir, { recursive: true });
        const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (!matches) {
          return res.status(400).json({ error: 'Formato de imagem inválido.' });
        }
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        if (buffer.length > 5 * 1024 * 1024) {
          return res.status(400).json({ error: 'A foto de capa excede o limite de 5 MB.' });
        }

        const fileName = `cover-${sessionUser.id}-${Date.now()}.${ext}`;
        const filePath = path.join(uploadsDir, fileName);
        fs.writeFileSync(filePath, buffer);
        targetCoverUrl = `/uploads/${fileName}`;
      } catch (err) {
        // Fallback: save dataUrl directly for 100% Vercel persistence
        targetCoverUrl = dataUrl;
      }
    }

    if (!targetCoverUrl) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    }

    const profile = getOrCreateProfile(sessionUser.id, sessionUser);
    profile.coverUrl = targetCoverUrl;
    profile.updatedAt = new Date().toISOString();

    persistState();
    void persistSocialProfileToNeon(profile);

    res.json({
      ok: true,
      coverUrl: targetCoverUrl,
      profile,
    });
  });

  // 4. GET /api/profile/posts - List social posts (feed or user specific)
  app.get('/api/profile/posts', guard, (req: any, res) => {
    const { authorId } = req.query;
    let posts = [...state.posts];
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
  app.post('/api/profile/posts', guard, (req: any, res) => {
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
          if (img.startsWith('data:image/')) {
            try {
              fs.mkdirSync(uploadsDir, { recursive: true });
              const matches = img.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
              if (matches) {
                const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                const fileName = `post-img-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
                fs.writeFileSync(path.join(uploadsDir, fileName), buffer);
                validImages.push(`/uploads/${fileName}`);
                continue;
              }
            } catch {}
          }
          validImages.push(img);
        }
      }
    }

    const profile = getOrCreateProfile(sessionUser.id, sessionUser);
    const newPost: SocialPost = {
      id: `post-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      authorId: sessionUser.id,
      authorName: profile.customDisplayName || sessionUser.name,
      authorAvatar: sessionUser.avatar || '/assets/avatar-joao.jpg',
      authorRole: sessionUser.roleTitle || 'Colaborador',
      authorDepartment: sessionUser.department || 'Geral',
      content: cleanContent,
      images: validImages,
      likes: [],
      comments: [],
      commentsCount: 0,
      audience: audience || 'Público',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    state.posts.unshift(newPost);
    persistState();
    void persistSocialPostToNeon(newPost);

    res.status(201).json({
      ok: true,
      post: newPost,
    });
  });

  // 6. PUT /api/profile/posts/:postId - Edit post
  app.put('/api/profile/posts/:postId', guard, (req: any, res) => {
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

    persistState();
    void persistSocialPostToNeon(post);

    res.json({
      ok: true,
      post,
    });
  });

  // 7. DELETE /api/profile/posts/:postId - Delete post
  app.delete('/api/profile/posts/:postId', guard, (req: any, res) => {
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
    persistState();
    void deleteSocialPostFromNeon(postId);

    res.json({
      ok: true,
      deletedPostId: postId,
    });
  });

  // 8. POST /api/profile/posts/:postId/like - Toggle like
  app.post('/api/profile/posts/:postId/like', guard, (req: any, res) => {
    const sessionUser = req.sessionUser;
    const { postId } = req.params;

    const post = state.posts.find((p) => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Publicação não encontrada.' });
    }

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

    persistState();
    void persistSocialPostToNeon(post);

    res.json({
      ok: true,
      isLiked,
      likesCount: post.likes.length,
      likes: post.likes,
    });
  });

  // 9. POST /api/profile/posts/:postId/comments - Add comment
  app.post('/api/profile/posts/:postId/comments', guard, (req: any, res) => {
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
      authorAvatar: sessionUser.avatar || '/assets/avatar-joao.jpg',
      authorRole: sessionUser.roleTitle || 'Colaborador',
      content: String(content).trim().slice(0, 1000),
      createdAt: new Date().toISOString(),
    };

    post.comments ||= [];
    post.comments.push(newComment);
    post.commentsCount = post.comments.length;

    persistState();
    void persistSocialCommentToNeon(newComment);
    void persistSocialPostToNeon(post);

    res.status(201).json({
      ok: true,
      comment: newComment,
      commentsCount: post.commentsCount,
    });
  });

  // 10. DELETE /api/profile/posts/:postId/comments/:commentId - Delete comment
  app.delete('/api/profile/posts/:postId/comments/:commentId', guard, (req: any, res) => {
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

    persistState();
    void deleteSocialCommentFromNeon(commentId);
    void persistSocialPostToNeon(post);

    res.json({
      ok: true,
      commentsCount: post.commentsCount,
    });
  });
}
