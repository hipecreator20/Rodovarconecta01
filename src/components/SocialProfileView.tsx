import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Camera,
  Edit3,
  Share2,
  CheckCircle2,
  Briefcase,
  Building2,
  MapPin,
  Phone,
  Mail,
  Image as ImageIcon,
  Users as UsersIcon,
  Link as LinkIcon,
  Send,
  ThumbsUp,
  MessageSquare,
  MoreHorizontal,
  X,
  ExternalLink,
  Lock,
  Download,
  AlertTriangle,
  FileText,
  Heart,
  Globe,
  Settings,
  Trash2,
  Maximize2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { Employee, SystemConfig, UserSocialProfile, SocialPost, SocialComment } from '../types';
import {
  apiFetchSocialProfile,
  apiUpdateSocialProfile,
  apiUploadCoverPhoto,
  apiUploadProfileAvatar,
  apiFetchSocialPosts,
  apiCreateSocialPost,
  apiUpdateSocialPost,
  apiDeleteSocialPost,
  apiTogglePostLike,
  apiAddPostComment,
  apiDeletePostComment,
  resolveAvatarUrl,
} from '../lib/serverApi';
import { ProfileSecurity } from './ProfileSecurity';
import { CorporateModal } from './ui/CorporateModal';

interface SocialProfileViewProps {
  currentUser: Employee;
  systemConfig?: SystemConfig;
  onUpdateMyProfile?: (updated: Partial<Employee>) => void;
  announcements?: any[];
  events?: any[];
  requests?: any[];
  onDownloadFunctionalSheet?: (employee: Employee) => void;
}

export const SocialProfileView: React.FC<SocialProfileViewProps> = ({
  currentUser,
  systemConfig,
  onUpdateMyProfile,
  announcements = [],
  events = [],
  requests = [],
  onDownloadFunctionalSheet,
}) => {
  // Navigation tabs: 'social' | 'posts' | 'photos' | 'likes' | 'settings'
  const [activeTab, setActiveTab] = useState<'social' | 'posts' | 'photos' | 'likes' | 'settings'>('social');

  // Profile data
  const [profile, setProfile] = useState<UserSocialProfile | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Post composer state
  const [newPostText, setNewPostText] = useState<string>('');
  const [newPostImages, setNewPostImages] = useState<string[]>([]);
  const [newPostAudience, setNewPostAudience] = useState<string>('Comercial');
  const [isPosting, setIsPosting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Edit Profile Modal state
  const [isEditProfileOpen, setIsEditProfileOpen] = useState<boolean>(false);
  const [editForm, setEditForm] = useState({
    customDisplayName: '',
    phone: '',
    location: '',
    bio: '',
    instagram: '',
    linkedin: '',
    facebook: '',
    youtube: '',
    tiktok: '',
    website: '',
  });
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);

  // Edit Post Modal state
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [editPostContent, setEditPostContent] = useState<string>('');
  const [isUpdatingPost, setIsUpdatingPost] = useState<boolean>(false);

  // Lightbox Modal state
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Comments state per post
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [commentInputText, setCommentInputText] = useState<{ [postId: string]: string }>({});
  const [isSubmittingComment, setIsSubmittingComment] = useState<boolean>(false);

  // Credencial modal state in Settings tab
  const [showCredencialModal, setShowCredencialModal] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load profile and posts from API
  const loadProfileData = async () => {
    setIsLoading(true);
    try {
      const [profRes, postsRes] = await Promise.all([
        apiFetchSocialProfile(currentUser.id),
        apiFetchSocialPosts(),
      ]);

      if (profRes.ok && profRes.profile) {
        setProfile(profRes.profile);
        setPhotos(profRes.photos || []);
        setEditForm({
          customDisplayName: profRes.profile.customDisplayName || currentUser.name,
          phone: profRes.profile.phone || currentUser.phoneExt || '',
          location: profRes.profile.location || 'Salvador – BA',
          bio: profRes.profile.bio || '',
          instagram: profRes.profile.socialLinks?.instagram || '',
          linkedin: profRes.profile.socialLinks?.linkedin || '',
          facebook: profRes.profile.socialLinks?.facebook || '',
          youtube: profRes.profile.socialLinks?.youtube || '',
          tiktok: profRes.profile.socialLinks?.tiktok || '',
          website: profRes.profile.socialLinks?.website || '',
        });
      }

      if (postsRes.ok) {
        setPosts(postsRes.posts);
      }
    } catch {
      setErrorMessage('Erro ao carregar informações sociais.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProfileData();
  }, [currentUser.id]);

  // Handle avatar upload
  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('A foto de perfil excede o limite de 5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        try {
          const res = await apiUploadProfileAvatar(reader.result);
          if (res.ok && res.user) {
            onUpdateMyProfile?.({ avatar: res.user.avatar, hasCustomAvatar: true });
            showToast('Foto de perfil atualizada com sucesso!');
          } else {
            setErrorMessage(res.error || 'Erro ao atualizar foto de perfil.');
          }
        } catch {
          setErrorMessage('Falha ao enviar avatar.');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle cover photo upload
  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('A foto de capa excede o limite de 5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        try {
          const res = await apiUploadCoverPhoto(reader.result);
          if (res.ok && res.coverUrl) {
            setProfile((prev) => (prev ? { ...prev, coverUrl: res.coverUrl } : null));
            showToast('Foto de capa atualizada com sucesso!');
          } else {
            setErrorMessage(res.error || 'Erro ao enviar foto de capa.');
          }
        } catch {
          setErrorMessage('Falha ao enviar imagem de capa.');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle post image additions
  const handlePostImagesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setNewPostImages((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // Submit new post
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostText.trim() && newPostImages.length === 0) return;

    setIsPosting(true);
    setErrorMessage(null);
    try {
      const res = await apiCreateSocialPost({
        content: newPostText,
        images: newPostImages,
        audience: newPostAudience,
      });

      if (res.ok && res.post) {
        setPosts((prev) => [res.post!, ...prev]);
        setNewPostText('');
        setNewPostImages([]);
        showToast('Publicação criada com sucesso!');
      } else {
        setErrorMessage(res.error || 'Não foi possível publicar.');
      }
    } catch {
      setErrorMessage('Erro de comunicação ao publicar.');
    } finally {
      setIsPosting(false);
    }
  };

  // Delete post
  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta publicação?')) return;

    try {
      const res = await apiDeleteSocialPost(postId);
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== postId));
        showToast('Publicação excluída com sucesso.');
      } else {
        setErrorMessage(res.error || 'Não foi possível excluir a publicação.');
      }
    } catch {
      setErrorMessage('Erro ao comunicar com o servidor.');
    }
  };

  // Submit edit post
  const handleSavePostEdit = async () => {
    if (!editingPost) return;
    setIsUpdatingPost(true);
    try {
      const res = await apiUpdateSocialPost(editingPost.id, {
        content: editPostContent,
      });
      if (res.ok && res.post) {
        setPosts((prev) => prev.map((p) => (p.id === editingPost.id ? res.post! : p)));
        setEditingPost(null);
        showToast('Publicação atualizada!');
      } else {
        setErrorMessage(res.error || 'Falha ao atualizar publicação.');
      }
    } catch {
      setErrorMessage('Erro ao atualizar publicação.');
    } finally {
      setIsUpdatingPost(false);
    }
  };

  // Toggle like
  const handleToggleLike = async (postId: string) => {
    try {
      const res = await apiTogglePostLike(postId);
      if (res.ok && res.likes) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  likes: res.likes || [],
                }
              : p
          )
        );
      }
    } catch {
      // silent
    }
  };

  // Add comment
  const handleAddComment = async (postId: string) => {
    const text = (commentInputText[postId] || '').trim();
    if (!text) return;

    setIsSubmittingComment(true);
    try {
      const res = await apiAddPostComment(postId, text);
      if (res.ok && res.comment) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  comments: [...(p.comments || []), res.comment!],
                  commentsCount: (p.commentsCount || 0) + 1,
                }
              : p
          )
        );
        setCommentInputText((prev) => ({ ...prev, [postId]: '' }));
      }
    } catch {
      // silent
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Delete comment
  const handleDeleteComment = async (postId: string, commentId: string) => {
    if (!window.confirm('Excluir este comentário?')) return;
    try {
      const res = await apiDeletePostComment(postId, commentId);
      if (res.ok) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  comments: (p.comments || []).filter((c) => c.id !== commentId),
                  commentsCount: Math.max(0, (p.commentsCount || 1) - 1),
                }
              : p
          )
        );
      }
    } catch {
      // silent
    }
  };

  // Save profile edits
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setErrorMessage(null);
    try {
      const res = await apiUpdateSocialProfile({
        customDisplayName: editForm.customDisplayName,
        phone: editForm.phone,
        location: editForm.location,
        bio: editForm.bio,
        socialLinks: {
          instagram: editForm.instagram,
          linkedin: editForm.linkedin,
          facebook: editForm.facebook,
          youtube: editForm.youtube,
          tiktok: editForm.tiktok,
          website: editForm.website,
        },
      });

      if (res.ok && res.profile) {
        setProfile(res.profile);
        setIsEditProfileOpen(false);
        showToast('Perfil atualizado com sucesso!');
        onUpdateMyProfile?.({
          name: editForm.customDisplayName,
          phoneExt: editForm.phone,
        });
      } else {
        setErrorMessage(res.error || 'Não foi possível atualizar o perfil.');
      }
    } catch {
      setErrorMessage('Erro ao salvar alterações no servidor.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const effectiveAvatarSrc = resolveAvatarUrl(
    {
      ...currentUser,
      hasCustomAvatar: currentUser.hasCustomAvatar,
    },
    systemConfig
  );

  const coverSrc = profile?.coverUrl || '/assets/banner-rodovar-conecta-highway.png';

  const userDisplayName = profile?.customDisplayName || currentUser.name;
  const userBio =
    profile?.bio ||
    'Profissional da área comercial, apaixonado por logística, transporte e conexão de pessoas. Comprometido com resultados, atendimento de qualidade e o crescimento da RODOVAR.';
  const userLocation = profile?.location || 'Salvador – BA';
  const userPhone = profile?.phone || currentUser.phoneExt || '(71) 9 9920-2476';

  // Filter posts based on active tab
  const displayedPosts =
    activeTab === 'likes'
      ? posts.filter((p) => (p.likes || []).includes(currentUser.id))
      : activeTab === 'posts'
      ? posts.filter((p) => p.authorId === currentUser.id)
      : posts;

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12">
      {/* Toast Banner */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 bg-[#080B0D] text-[#FFD400] border border-[#FFD400]/40 px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-bold animate-in fade-in slide-in-from-bottom-3"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-[#E5252A] flex items-center justify-between gap-2 shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-gray-400 hover:text-gray-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Header Banner */}
      <header className="bg-[#080B0D] text-white rounded-2xl p-5 border border-[#FFD400]/30 shadow-md flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-[#FFD400] text-[#080B0D] flex items-center justify-center shrink-0 shadow-sm">
            <User className="w-7 h-7 stroke-[2.4]" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight">Meu Perfil</h1>
            <p className="text-xs text-gray-300">
              Seu espaço de colaboração, publicações e informações pessoais.
            </p>
          </div>
        </div>
      </header>

      {/* 2. Cover Photo & Profile Hero Card */}
      <div className="bg-white rounded-3xl border border-gray-200/90 shadow-sm overflow-hidden">
        {/* Panoramic Cover */}
        <div className="relative w-full h-56 sm:h-72 md:h-80 bg-linear-to-r from-gray-900 via-gray-800 to-gray-900 overflow-hidden group">
          <img
            src={coverSrc}
            alt="Capa do Perfil"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center group-hover:scale-102 transition duration-500"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/40 via-transparent to-black/20" />

          {/* Alterar Capa Button */}
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white backdrop-blur-md px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border border-white/20 transition cursor-pointer shadow-md"
          >
            <Camera className="w-4 h-4 text-[#FFD400]" />
            <span>Alterar capa</span>
          </button>
          <input
            type="file"
            ref={coverInputRef}
            onChange={handleCoverFileChange}
            accept="image/*, .png, .jpg, .jpeg, .webp, .gif, .bmp, .avif, .ico"
            className="hidden"
          />
        </div>

        {/* Profile Info Overlap */}
        <div className="px-6 pb-6 pt-0 relative">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 -mt-16 sm:-mt-20">
            {/* Avatar + Main Details */}
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 text-center sm:text-left">
              {/* Circular Avatar */}
              <div className="relative shrink-0 group">
                <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full border-4 border-white bg-[#080B0D] overflow-hidden shadow-xl aspect-square">
                  <img
                    src={effectiveAvatarSrc}
                    alt={userDisplayName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Avatar upload trigger button badge */}
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute bottom-1 right-1 w-9 h-9 rounded-full bg-[#080B0D] text-[#FFD400] hover:bg-black border-2 border-white flex items-center justify-center shadow-lg transition cursor-pointer"
                  title="Alterar foto de perfil"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  type="file"
                  ref={avatarInputRef}
                  onChange={handleAvatarFileChange}
                  accept="image/*, .png, .jpg, .jpeg, .webp, .gif, .bmp, .avif, .ico"
                  className="hidden"
                />
              </div>

              {/* Names & Role Title */}
              <div className="mb-2">
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <h2 className="text-2xl font-black text-[#080B0D] tracking-tight">
                    {userDisplayName}
                  </h2>
                  <span title="Perfil Corporativo Verificado">
                    <CheckCircle2 className="w-5 h-5 text-blue-500 fill-blue-500/10 stroke-[2.5]" />
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-600 mt-0.5">
                  {currentUser.roleTitle || 'Comercial'} • RODOVAR Transportes
                </p>
                <div className="flex items-center justify-center sm:justify-start gap-2 mt-1.5 text-xs font-semibold text-emerald-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                  <span>Online</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-center sm:justify-end gap-2.5 mb-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsEditProfileOpen(true)}
                className="bg-[#FFD400] hover:bg-[#ffdc26] text-[#080B0D] px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-xs transition cursor-pointer"
              >
                <Edit3 className="w-4 h-4 stroke-[2.5]" />
                <span>Editar Perfil</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const url = window.location.href;
                  navigator.clipboard?.writeText(url);
                  showToast('Link do perfil copiado para a área de transferência!');
                }}
                className="bg-white hover:bg-gray-100 text-gray-800 border border-gray-200 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs transition cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-gray-600" />
                <span>Compartilhar Perfil</span>
              </button>
            </div>
          </div>

          {/* 3. Navigation Tabs Bar */}
          <div className="mt-6 pt-2 border-t border-gray-100 flex items-center gap-1 overflow-x-auto scrollbar-none">
            {[
              { id: 'social', label: 'Perfil Social', icon: User },
              { id: 'posts', label: 'Publicações', icon: FileText },
              { id: 'photos', label: 'Fotos', icon: ImageIcon },
              { id: 'likes', label: 'Curtidas', icon: ThumbsUp },
              { id: 'settings', label: 'Configurações', icon: Settings },
            ].map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id as any)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                    active
                      ? 'bg-[#080B0D] text-[#FFD400] shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-[#FFD400]' : 'text-gray-500'}`} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Tab Views */}

      {/* TAB A: Perfil Social & Publicações (Grid Layout) */}
      {(activeTab === 'social' || activeTab === 'posts' || activeTab === 'likes') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column (Sobre mim) */}
          <div className="lg:col-span-4 space-y-5">
            <div className="bg-white rounded-2xl p-5 border border-gray-200/90 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-[#080B0D] flex items-center gap-2">
                  <User className="w-4 h-4 text-[#FFD400]" />
                  <span>Sobre mim</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditProfileOpen(true)}
                  className="text-gray-400 hover:text-[#080B0D] transition cursor-pointer"
                  title="Editar biografia e informações"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>

              {/* Bio */}
              <p className="text-xs text-gray-600 leading-relaxed font-normal">
                {userBio}
              </p>

              {/* Professional Attributes List */}
              <div className="space-y-3 pt-3 border-t border-gray-100 text-xs">
                <div className="flex items-start gap-3 text-gray-700">
                  <Briefcase className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[11px] font-bold text-gray-400 block">Cargo</span>
                    <span className="font-semibold text-gray-800">{currentUser.roleTitle || 'Comercial'}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-gray-700">
                  <Building2 className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[11px] font-bold text-gray-400 block">Departamento</span>
                    <span className="font-semibold text-gray-800">{currentUser.department}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-gray-700">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[11px] font-bold text-gray-400 block">Localidade</span>
                    <span className="font-semibold text-gray-800">{userLocation}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-gray-700">
                  <Phone className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[11px] font-bold text-gray-400 block">Telefone</span>
                    <span className="font-semibold text-gray-800">{userPhone}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-gray-700">
                  <Mail className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-gray-400 block">E-mail Corporativo</span>
                    <span className="font-semibold text-gray-800 truncate block">{currentUser.email}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Minhas Redes Sociais Card */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200/90 shadow-2xs space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-[#080B0D] flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-[#FFD400]" />
                  <span>Minhas Redes Sociais</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditProfileOpen(true)}
                  className="text-gray-400 hover:text-[#080B0D] transition cursor-pointer"
                  title="Editar redes sociais"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                {profile?.socialLinks?.instagram && (
                  <a
                    href={profile.socialLinks.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-pink-50/50 hover:bg-pink-50 border border-pink-100 text-pink-700 font-bold transition group"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="w-5 h-5 rounded-md bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">
                        IG
                      </span>
                      <span className="truncate">{profile.socialLinks.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\/?/, '@')}</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 shrink-0" />
                  </a>
                )}

                {profile?.socialLinks?.linkedin && (
                  <a
                    href={profile.socialLinks.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/50 hover:bg-blue-50 border border-blue-100 text-blue-700 font-bold transition group"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">
                        in
                      </span>
                      <span className="truncate">{profile.socialLinks.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\/?/, '')}</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 shrink-0" />
                  </a>
                )}

                {profile?.socialLinks?.facebook && (
                  <a
                    href={profile.socialLinks.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/40 hover:bg-blue-50 border border-blue-100 text-blue-800 font-bold transition group"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="w-5 h-5 rounded-md bg-blue-700 flex items-center justify-center text-white text-[10px] font-bold">
                        fb
                      </span>
                      <span className="truncate">{profile.socialLinks.facebook.replace(/^https?:\/\/(www\.)?facebook\.com\/?/, '')}</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 shrink-0" />
                  </a>
                )}

                {profile?.socialLinks?.youtube && (
                  <a
                    href={profile.socialLinks.youtube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-red-50/50 hover:bg-red-50 border border-red-100 text-red-700 font-bold transition group"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="w-5 h-5 rounded-md bg-red-600 flex items-center justify-center text-white text-[10px] font-bold">
                        YT
                      </span>
                      <span className="truncate">{profile.socialLinks.youtube.replace(/^https?:\/\/(www\.)?youtube\.com\/?/, '')}</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 shrink-0" />
                  </a>
                )}

                {profile?.socialLinks?.tiktok && (
                  <a
                    href={profile.socialLinks.tiktok}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-900 font-bold transition group"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="w-5 h-5 rounded-md bg-black flex items-center justify-center text-white text-[10px] font-bold">
                        TK
                      </span>
                      <span className="truncate">{profile.socialLinks.tiktok.replace(/^https?:\/\/(www\.)?tiktok\.com\/?/, '')}</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 shrink-0" />
                  </a>
                )}

                {profile?.socialLinks?.website && (
                  <a
                    href={profile.socialLinks.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-100 text-emerald-800 font-bold transition group"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Globe className="w-4 h-4 text-emerald-600" />
                      <span className="truncate">{profile.socialLinks.website.replace(/^https?:\/\//, '')}</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 shrink-0" />
                  </a>
                )}

                {!profile?.socialLinks?.instagram &&
                  !profile?.socialLinks?.linkedin &&
                  !profile?.socialLinks?.facebook &&
                  !profile?.socialLinks?.youtube &&
                  !profile?.socialLinks?.tiktok &&
                  !profile?.socialLinks?.website && (
                    <p className="text-gray-400 italic text-[11px] py-1 text-center">
                      Nenhuma rede social configurada ainda.
                    </p>
                  )}
              </div>
            </div>

            {/* Galeria de Fotos Widget */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200/90 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-[#080B0D] flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-[#FFD400]" />
                  <span>Galeria de Fotos</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('photos')}
                  className="text-xs font-bold text-amber-600 hover:text-amber-700 cursor-pointer"
                >
                  Ver todas
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {photos.slice(0, 6).map((img, idx) => {
                  const isLastWithMore = idx === 5 && photos.length > 6;
                  return (
                    <div
                      key={idx}
                      onClick={() => (isLastWithMore ? setActiveTab('photos') : setLightboxImage(img))}
                      className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer group"
                    >
                      <img
                        src={img}
                        alt={`Foto ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
                      />
                      {isLastWithMore && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-extrabold text-base">
                          +{photos.length - 5}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Center Column: Post Composer & Feed */}
          <div className="lg:col-span-8 space-y-5">
            {/* Post Creator Box */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200/90 shadow-2xs space-y-3">
              <div className="flex items-start gap-3">
                <img
                  src={effectiveAvatarSrc}
                  alt={userDisplayName}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full object-cover border border-[#FFD400] shrink-0 aspect-square"
                />
                <textarea
                  value={newPostText}
                  onChange={(e) => setNewPostText(e.target.value)}
                  placeholder="No que você está pensando hoje?"
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-[#F3F5F7] hover:bg-gray-100 focus:bg-white rounded-xl border border-gray-200 text-xs font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFD400] transition resize-none"
                />
              </div>

              {/* Preview of images to be posted */}
              {newPostImages.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                  {newPostImages.map((img, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 group">
                      <img src={img} alt="Anexo" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setNewPostImages((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] cursor-pointer"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Composer Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg hover:bg-gray-100 text-xs font-bold text-gray-600 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4 text-blue-500" />
                    <span>Foto / Vídeo</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handlePostImagesSelect}
                    multiple
                    accept="image/*"
                    className="hidden"
                  />

                  <select
                    value={newPostAudience}
                    onChange={(e) => setNewPostAudience(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-[11px] font-bold text-gray-700 cursor-pointer"
                  >
                    <option value="Comercial">Comercial</option>
                    <option value="Público">Público</option>
                    <option value="Expedição">Expedição</option>
                    <option value="Diretoria">Diretoria</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleCreatePost}
                  disabled={isPosting || (!newPostText.trim() && newPostImages.length === 0)}
                  className="bg-[#FFD400] hover:bg-[#ffdc26] disabled:opacity-50 text-[#080B0D] px-5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-xs transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>{isPosting ? 'Publicando...' : 'Publicar'}</span>
                </button>
              </div>
            </div>

            {/* Posts Feed */}
            <div className="space-y-4">
              {displayedPosts.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center border border-gray-200/80 shadow-2xs">
                  <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-gray-700">Nenhuma publicação encontrada</h4>
                  <p className="text-xs text-gray-400 mt-1">
                    Compartilhe novidades, conquistas ou fotos da rotina com a equipe RODOVAR!
                  </p>
                </div>
              ) : (
                displayedPosts.map((post) => {
                  const isAuthor = post.authorId === currentUser.id;
                  const isAdmin = currentUser.accessLevel === 'ADMINISTRADOR';
                  const isLikedByMe = (post.likes || []).includes(currentUser.id);

                  return (
                    <article
                      key={post.id}
                      className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs overflow-hidden transition hover:border-gray-300"
                    >
                      {/* Post Header */}
                      <div className="p-4 sm:p-5 pb-3 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={post.authorAvatar || '/assets/avatar-joao.jpg'}
                            alt={post.authorName}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover border border-[#FFD400] shrink-0 aspect-square"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-xs sm:text-sm font-extrabold text-[#080B0D]">
                                {post.authorName}
                              </h4>
                              <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 fill-blue-500/10" />
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-gray-400 font-medium">
                              <span>
                                {new Date(post.createdAt).toLocaleDateString('pt-BR', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              <span>•</span>
                              <span className="font-semibold text-gray-600">{post.audience || 'Comercial'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Options Menu (Edit/Delete) */}
                        {(isAuthor || isAdmin) && (
                          <div className="flex items-center gap-1">
                            {isAuthor && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPost(post);
                                  setEditPostContent(post.content);
                                }}
                                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 cursor-pointer"
                                title="Editar publicação"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeletePost(post.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                              title="Excluir publicação"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Post Body Content */}
                      <div className="px-4 sm:px-5 pb-3">
                        <p className="text-xs sm:text-sm text-gray-800 leading-relaxed whitespace-pre-line font-normal">
                          {post.content}
                        </p>
                      </div>

                      {/* Post Attached Images Layout (1, 2, 3 or more photos) */}
                      {Array.isArray(post.images) && post.images.length > 0 && (
                        <div className="px-4 sm:px-5 pb-3">
                          {post.images.length === 1 && (
                            <div
                              onClick={() => setLightboxImage(post.images[0])}
                              className="rounded-xl overflow-hidden cursor-pointer max-h-96 bg-gray-100"
                            >
                              <img
                                src={post.images[0]}
                                alt="Foto da publicação"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover hover:scale-101 transition duration-300"
                              />
                            </div>
                          )}

                          {post.images.length === 2 && (
                            <div className="grid grid-cols-2 gap-2 rounded-xl overflow-hidden">
                              {post.images.map((img, i) => (
                                <div
                                  key={i}
                                  onClick={() => setLightboxImage(img)}
                                  className="aspect-4/3 overflow-hidden cursor-pointer bg-gray-100 rounded-lg"
                                >
                                  <img
                                    src={img}
                                    alt="Foto da publicação"
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover hover:scale-103 transition duration-300"
                                  />
                                </div>
                              ))}
                            </div>
                          )}

                          {/* 3 Photos: 1 large on left, 2 stacked on right (matching mockup!) */}
                          {post.images.length >= 3 && (
                            <div className="grid grid-cols-12 gap-2 rounded-xl overflow-hidden">
                              <div
                                onClick={() => setLightboxImage(post.images[0])}
                                className="col-span-7 sm:col-span-8 aspect-4/3 sm:aspect-auto sm:h-72 overflow-hidden cursor-pointer bg-gray-100 rounded-lg"
                              >
                                <img
                                  src={post.images[0]}
                                  alt="Foto principal"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover hover:scale-102 transition duration-300"
                                />
                              </div>
                              <div className="col-span-5 sm:col-span-4 flex flex-col gap-2 sm:h-72">
                                <div
                                  onClick={() => setLightboxImage(post.images[1])}
                                  className="flex-1 overflow-hidden cursor-pointer bg-gray-100 rounded-lg"
                                >
                                  <img
                                    src={post.images[1]}
                                    alt="Foto secundária 1"
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover hover:scale-103 transition duration-300"
                                  />
                                </div>
                                <div
                                  onClick={() => setLightboxImage(post.images[2])}
                                  className="flex-1 overflow-hidden cursor-pointer bg-gray-100 rounded-lg relative"
                                >
                                  <img
                                    src={post.images[2]}
                                    alt="Foto secundária 2"
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover hover:scale-103 transition duration-300"
                                  />
                                  {post.images.length > 3 && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-extrabold text-sm">
                                      +{post.images.length - 3}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Reactions & Stats Bar */}
                      <div className="px-4 sm:px-5 py-2.5 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span className="flex items-center -space-x-1">
                            <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] shadow-xs">
                              👍
                            </span>
                            <span className="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] shadow-xs">
                              ❤️
                            </span>
                          </span>
                          <span>{(post.likes || []).length} curtidas</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveCommentPostId(activeCommentPostId === post.id ? null : post.id)
                          }
                          className="hover:underline font-medium cursor-pointer"
                        >
                          {post.commentsCount || (post.comments || []).length} comentários
                        </button>
                      </div>

                      {/* Action Buttons: Curtir / Comentar / Compartilhar */}
                      <div className="px-4 sm:px-5 py-1.5 border-t border-gray-100 grid grid-cols-3 gap-1">
                        <button
                          type="button"
                          onClick={() => handleToggleLike(post.id)}
                          className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                            isLikedByMe
                              ? 'text-blue-600 bg-blue-50/70 font-extrabold'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          <ThumbsUp className={`w-4 h-4 ${isLikedByMe ? 'fill-blue-600 text-blue-600' : ''}`} />
                          <span>Curtir</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setActiveCommentPostId(activeCommentPostId === post.id ? null : post.id)
                          }
                          className="py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 flex items-center justify-center gap-2 transition cursor-pointer"
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span>Comentar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(window.location.href);
                            showToast('Link da publicação copiado!');
                          }}
                          className="py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 flex items-center justify-center gap-2 transition cursor-pointer"
                        >
                          <Share2 className="w-4 h-4" />
                          <span>Compartilhar</span>
                        </button>
                      </div>

                      {/* Expandable Comments Drawer */}
                      {activeCommentPostId === post.id && (
                        <div className="bg-[#F8FAFC] border-t border-gray-100 p-4 sm:p-5 space-y-3">
                          {/* List of comments */}
                          <div className="space-y-2.5 max-h-60 overflow-y-auto">
                            {(post.comments || []).length === 0 ? (
                              <p className="text-center text-xs text-gray-400 py-2">
                                Seja o primeiro a comentar nesta publicação!
                              </p>
                            ) : (
                              post.comments.map((comment) => (
                                <div key={comment.id} className="flex items-start gap-2.5 group">
                                  <img
                                    src={comment.authorAvatar || '/assets/avatar-joao.jpg'}
                                    alt={comment.authorName}
                                    referrerPolicy="no-referrer"
                                    className="w-8 h-8 rounded-full object-cover shrink-0 aspect-square"
                                  />
                                  <div className="flex-1 bg-white p-2.5 rounded-xl border border-gray-200/70 text-xs shadow-2xs">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                      <span className="font-extrabold text-[#080B0D]">
                                        {comment.authorName}
                                      </span>
                                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                        <span>
                                          {new Date(comment.createdAt).toLocaleDateString('pt-BR', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                        </span>
                                        {(comment.authorId === currentUser.id ||
                                          post.authorId === currentUser.id ||
                                          isAdmin) && (
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteComment(post.id, comment.id)}
                                            className="text-gray-400 hover:text-red-600 cursor-pointer"
                                            title="Excluir comentário"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <p className="text-gray-700 leading-normal">{comment.content}</p>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          {/* New comment input */}
                          <div className="flex items-center gap-2 pt-2">
                            <img
                              src={effectiveAvatarSrc}
                              alt={userDisplayName}
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-full object-cover shrink-0 aspect-square"
                            />
                            <div className="flex-1 flex items-center gap-1.5 bg-white rounded-xl border border-gray-200 px-3 py-1.5 focus-within:ring-2 focus-within:ring-[#FFD400]">
                              <input
                                type="text"
                                value={commentInputText[post.id] || ''}
                                onChange={(e) =>
                                  setCommentInputText((prev) => ({
                                    ...prev,
                                    [post.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleAddComment(post.id);
                                  }
                                }}
                                placeholder="Escreva um comentário..."
                                className="w-full text-xs font-medium focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddComment(post.id)}
                                disabled={
                                  isSubmittingComment ||
                                  !(commentInputText[post.id] || '').trim()
                                }
                                className="text-amber-600 hover:text-amber-700 disabled:opacity-30 cursor-pointer"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB B: Fotos (Full Gallery View) */}
      {activeTab === 'photos' && (
        <div className="bg-white rounded-3xl p-6 border border-gray-200/90 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-[#080B0D]">Galeria de Fotos</h2>
              <p className="text-xs text-gray-500">
                Todas as fotos publicadas e adicionadas ao seu perfil social corporativo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab('social');
                fileInputRef.current?.click();
              }}
              className="bg-[#080B0D] hover:bg-black text-[#FFD400] text-xs font-extrabold px-4 py-2 rounded-xl flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Camera className="w-4 h-4" />
              <span>Adicionar Fotos</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {photos.map((img, i) => (
              <div
                key={i}
                onClick={() => setLightboxImage(img)}
                className="group relative aspect-square rounded-2xl overflow-hidden bg-gray-100 cursor-pointer shadow-2xs border border-gray-200"
              >
                <img
                  src={img}
                  alt={`Foto ${i + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                  <Maximize2 className="w-6 h-6" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB C: Configurações (Credencial, Senha, Conformidade) */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* Identificação Funcional e Credencial Corporativa */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200/90 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-base font-extrabold text-[#080B0D]">Credencial Funcional RODOVAR</h2>
                <p className="text-xs text-gray-500">
                  Cartão de identificação oficial com QR Code e matrícula funcional.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCredencialModal(true)}
                className="bg-[#080B0D] hover:bg-black text-[#FFD400] text-xs font-extrabold px-4 py-2 rounded-xl flex items-center gap-2 cursor-pointer shadow-xs self-start sm:self-auto"
              >
                <Download className="w-4 h-4" />
                <span>Visualizar / Baixar Credencial</span>
              </button>
            </div>

            {/* Quick Data Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-gray-200/80">
                <span className="text-gray-400 font-semibold block text-[11px]">Matrícula</span>
                <span className="font-mono font-bold text-[#080B0D] text-sm">RDV-{currentUser.id.toUpperCase()}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-gray-200/80">
                <span className="text-gray-400 font-semibold block text-[11px]">Nível de Acesso</span>
                <span className="font-bold text-[#080B0D] text-sm">{currentUser.accessLevel}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-gray-200/80">
                <span className="text-gray-400 font-semibold block text-[11px]">Data de Admissão</span>
                <span className="font-bold text-[#080B0D] text-sm">{currentUser.joinedAt || '01/01/2025'}</span>
              </div>
            </div>
          </div>

          {/* Segurança da Conta & Alteração de Senha */}
          <ProfileSecurity
            user={currentUser}
            onUpdated={(updatedUser) => onUpdateMyProfile?.(updatedUser)}
          />
        </div>
      )}

      {/* 5. EDIT PROFILE MODAL */}
      <CorporateModal
        isOpen={isEditProfileOpen}
        onClose={() => !isSavingProfile && setIsEditProfileOpen(false)}
        title="Editar Perfil Social Corporativo"
        subtitle="Atualize suas informações visíveis para toda a equipe RODOVAR."
        maxWidth="2xl"
        isLoading={isSavingProfile}
        footer={
          <>
            <button
              type="button"
              disabled={isSavingProfile}
              onClick={() => setIsEditProfileOpen(false)}
              className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="social-profile-form"
              disabled={isSavingProfile}
              className="px-5 py-2 rounded-xl bg-[#FFD400] hover:bg-[#ffdc26] text-[#080B0D] text-xs font-extrabold cursor-pointer shadow-xs"
            >
              {isSavingProfile ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </>
        }
      >
        <form id="social-profile-form" onSubmit={handleSaveProfile} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-700 mb-1">Nome Completo / Exibição</label>
              <input
                type="text"
                value={editForm.customDisplayName}
                onChange={(e) => setEditForm({ ...editForm, customDisplayName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FFD400] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-gray-700 mb-1">Telefone Corporativo / Ramal</label>
              <input
                type="text"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FFD400] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-gray-700 mb-1">Localidade (Cidade – UF)</label>
            <input
              type="text"
              value={editForm.location}
              onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FFD400] focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-bold text-gray-700 mb-1">Biografia / Apresentação Pessoal</label>
            <textarea
              rows={3}
              value={editForm.bio}
              onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
              placeholder="Fale brevemente sobre sua atuação, experiências e foco na RODOVAR..."
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FFD400] focus:outline-none resize-none"
            />
          </div>

          <div className="pt-2 border-t border-gray-100">
            <h4 className="font-extrabold text-[#080B0D] mb-2 flex items-center gap-1.5">
              <Share2 className="w-3.5 h-3.5 text-[#FFD400]" />
              <span>Links de Redes Sociais</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-gray-600 mb-1">Instagram (@handle ou URL)</label>
                <input
                  type="text"
                  placeholder="@usuario"
                  value={editForm.instagram}
                  onChange={(e) => setEditForm({ ...editForm, instagram: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FFD400] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1">LinkedIn (perfil ou URL)</label>
                <input
                  type="text"
                  placeholder="linkedin.com/in/usuario"
                  value={editForm.linkedin}
                  onChange={(e) => setEditForm({ ...editForm, linkedin: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FFD400] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1">Facebook (URL)</label>
                <input
                  type="text"
                  placeholder="facebook.com/usuario"
                  value={editForm.facebook}
                  onChange={(e) => setEditForm({ ...editForm, facebook: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FFD400] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1">YouTube (Canal ou @)</label>
                <input
                  type="text"
                  placeholder="youtube.com/@Canal"
                  value={editForm.youtube}
                  onChange={(e) => setEditForm({ ...editForm, youtube: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FFD400] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1">TikTok (@handle)</label>
                <input
                  type="text"
                  placeholder="tiktok.com/@usuario"
                  value={editForm.tiktok}
                  onChange={(e) => setEditForm({ ...editForm, tiktok: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FFD400] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1">Website Pessoal / Portfolio</label>
                <input
                  type="text"
                  placeholder="https://meusite.com.br"
                  value={editForm.website}
                  onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FFD400] focus:outline-none"
                />
              </div>
            </div>
          </div>
        </form>
      </CorporateModal>

      {/* 6. EDIT POST MODAL */}
      <CorporateModal
        isOpen={Boolean(editingPost)}
        onClose={() => setEditingPost(null)}
        title="Editar Publicação"
        maxWidth="lg"
        isLoading={isUpdatingPost}
        footer={
          <>
            <button
              type="button"
              disabled={isUpdatingPost}
              onClick={() => setEditingPost(null)}
              className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isUpdatingPost || !editPostContent.trim()}
              onClick={handleSavePostEdit}
              className="px-5 py-2 rounded-xl bg-[#FFD400] hover:bg-[#ffdc26] text-[#080B0D] text-xs font-extrabold cursor-pointer shadow-xs"
            >
              {isUpdatingPost ? 'Salvando...' : 'Salvar Publicação'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <textarea
            rows={5}
            value={editPostContent}
            onChange={(e) => setEditPostContent(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-[#F3F5F7] rounded-xl border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-[#FFD400] focus:outline-none resize-none"
          />
        </div>
      </CorporateModal>

      {/* 7. LIGHTBOX MODAL */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-5 right-5 text-white/70 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxImage}
            alt="Foto Ampliada"
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}

      {/* 8. CREDENCIAL MODAL (In Settings) */}
      <CorporateModal
        isOpen={showCredencialModal}
        onClose={() => setShowCredencialModal(false)}
        title="Credencial Funcional Oficial RODOVAR"
        subtitle="Identificação corporativa oficial para uso interno e representação externa."
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="relative w-full max-w-md mx-auto aspect-16/10 rounded-2xl bg-[#080B0D] border-4 border-[#FFD400] p-5 text-white shadow-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-white/15 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#FFD400] flex items-center justify-center text-[#080B0D] font-black text-xs">
                  RDV
                </div>
                <span className="font-black text-xs tracking-wider text-[#FFD400]">RODOVAR CONECTA</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 font-bold">● ATIVA</span>
            </div>

            <div className="flex items-center gap-4 py-2">
              <img
                src={effectiveAvatarSrc}
                alt={userDisplayName}
                className="w-16 h-16 rounded-full object-cover border-2 border-[#FFD400] shrink-0 aspect-square"
              />
              <div className="min-w-0">
                <h3 className="font-extrabold text-sm text-white truncate">{userDisplayName}</h3>
                <p className="text-xs text-[#FFD400] font-bold">{currentUser.roleTitle || 'Comercial'}</p>
                <p className="text-[11px] text-gray-400">Setor: {currentUser.department}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-white/15 flex items-center justify-between text-[10px] font-mono">
              <span className="text-[#FFD400] font-bold">MATRÍCULA: RDV-{currentUser.id.toUpperCase()}</span>
              <span className="text-gray-400">Salvador – BA</span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => {
                const canvas = document.createElement('canvas');
                canvas.width = 1011;
                canvas.height = 638;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.fillStyle = '#080B0D';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.strokeStyle = '#FFD400';
                  ctx.lineWidth = 12;
                  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

                  ctx.fillStyle = '#FFD400';
                  ctx.font = 'bold 38px sans-serif';
                  ctx.fillText('RODOVAR CONECTA', 48, 72);

                  ctx.fillStyle = '#D1D5DB';
                  ctx.font = '20px monospace';
                  ctx.fillText('CREDENCIAL FUNCIONAL OFICIAL • CR80 (85,6 × 54 mm)', 48, 108);

                  ctx.fillStyle = '#FFD400';
                  ctx.fillRect(48, 132, canvas.width - 96, 3);

                  ctx.fillStyle = '#FFFFFF';
                  ctx.font = 'bold 44px sans-serif';
                  ctx.fillText(userDisplayName, 48, 230);

                  ctx.fillStyle = '#FFD400';
                  ctx.font = 'bold 32px sans-serif';
                  ctx.fillText(currentUser.roleTitle || 'Comercial', 48, 285);

                  ctx.fillStyle = '#E5E7EB';
                  ctx.font = '26px sans-serif';
                  ctx.fillText(`Setor: ${currentUser.department}`, 48, 340);
                  ctx.fillText(`E-mail: ${currentUser.email}`, 48, 385);
                  ctx.fillText(`Nível: ${currentUser.accessLevel}`, 48, 430);

                  ctx.fillStyle = '#FFD400';
                  ctx.fillRect(48, 520, canvas.width - 96, 2);

                  ctx.fillStyle = '#FFD400';
                  ctx.font = 'bold 26px monospace';
                  ctx.fillText(`MATRÍCULA: RDV-${currentUser.id.toUpperCase()}`, 48, 575);

                  ctx.fillStyle = '#34D399';
                  ctx.fillText('CREDENCIAL ATIVA', canvas.width - 320, 575);

                  const link = document.createElement('a');
                  link.download = `Credencial_RODOVAR_${currentUser.id}.png`;
                  link.href = canvas.toDataURL('image/png');
                  link.click();
                }
              }}
              className="bg-[#080B0D] hover:bg-black text-[#FFD400] text-xs font-extrabold px-4 py-2 rounded-xl flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Arquivo da Credencial (PNG)</span>
            </button>
          </div>
        </div>
      </CorporateModal>
    </div>
  );
};
