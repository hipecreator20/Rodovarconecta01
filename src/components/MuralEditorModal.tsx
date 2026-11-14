import React, { useState, useRef, useEffect } from 'react';
import {
  Megaphone,
  Pin,
  CheckCircle2,
  Sparkles,
  Paperclip,
  UploadCloud,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Trash2,
  X,
  Send,
  AlertCircle,
  HelpCircle,
  Info,
  Layers,
  ShieldAlert,
} from 'lucide-react';

export interface MuralAttachment {
  id?: string;
  name: string;
  size: string;
  type: string;
  dataUrl?: string;
  url?: string;
}

export interface MuralFormData {
  id?: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  priority: string;
  targetAudience: string;
  requireReadConfirmation: boolean;
  pinned: boolean;
  featured: boolean;
  coverImage: string;
  bannerImage: string;
  attachments: MuralAttachment[];
  editNote: string;
  draft?: boolean;
}

interface MuralEditorModalProps {
  editing: { id?: string; new?: boolean };
  initialForm: MuralFormData;
  busy: boolean;
  serverError?: string;
  onClose: () => void;
  onSaveDraft: (form: MuralFormData) => Promise<void>;
  onPublish: (form: MuralFormData) => Promise<void>;
}

const CATEGORIES = [
  'Comunicado Geral',
  'Importante',
  'Urgente',
  'Recursos Humanos',
  'Segurança',
  'Operacional',
  'Eventos',
  'Diretoria',
] as const;

const PRIORITIES = ['Normal', 'Importante', 'Urgente'] as const;

const AUDIENCES = [
  'Todos',
  'Operacional',
  'Logística',
  'Administrativo',
  'Financeiro',
  'Recursos Humanos',
  'Segurança',
  'Diretoria',
] as const;

const CORPORATE_PRESETS = [
  {
    label: 'Banner Oficial Rodovia RODOVAR',
    url: '/assets/banner-rodovar-conecta-highway.png',
  },
  {
    label: 'Caminhão Rodovar ao Pôr do Sol',
    url: '/assets/login-rodovar-sunset-v2.png',
  },
  {
    label: 'Pátio & Frota Logística',
    url: '/assets/aistudio/DSC00515_18c5e319.JPG',
  },
];

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.ceil(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getFileIcon(typeOrName: string) {
  const ext = (typeOrName || '').split('.').pop()?.toUpperCase() || typeOrName?.toUpperCase() || '';
  if (ext === 'PDF') {
    return <FileText className="w-5 h-5 text-red-600 shrink-0" />;
  }
  if (['DOC', 'DOCX'].includes(ext)) {
    return <FileText className="w-5 h-5 text-blue-600 shrink-0" />;
  }
  if (['XLS', 'XLSX'].includes(ext)) {
    return <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />;
  }
  if (['PNG', 'JPG', 'JPEG', 'WEBP'].includes(ext)) {
    return <ImageIcon className="w-5 h-5 text-purple-600 shrink-0" />;
  }
  return <Paperclip className="w-5 h-5 text-gray-500 shrink-0" />;
}

export const MuralEditorModal: React.FC<MuralEditorModalProps> = ({
  editing,
  initialForm,
  busy,
  serverError,
  onClose,
  onSaveDraft,
  onPublish,
}) => {
  const [form, setForm] = useState<MuralFormData>(() => ({
    title: initialForm?.title || '',
    summary: initialForm?.summary || '',
    content: initialForm?.content || '',
    category: initialForm?.category || 'Comunicado Geral',
    priority: initialForm?.priority || 'Normal',
    targetAudience: initialForm?.targetAudience || 'Todos',
    requireReadConfirmation: initialForm?.requireReadConfirmation ?? true,
    pinned: !!initialForm?.pinned,
    featured: !!initialForm?.featured,
    coverImage: initialForm?.coverImage || '',
    bannerImage:
      initialForm?.bannerImage ||
      initialForm?.coverImage ||
      '/assets/login-rodovar-sunset-v2.png',
    attachments: Array.isArray(initialForm?.attachments)
      ? initialForm.attachments.map((a) => ({ ...a }))
      : [],
    editNote: initialForm?.editNote || '',
  }));

  const [localError, setLocalError] = useState<string>('');
  const [readingFiles, setReadingFiles] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus and ESC handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose]);

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (file.size > 5 * 1024 * 1024) {
        reject(new Error(`O arquivo "${file.name}" ultrapassa o limite de 5 MB.`));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error(`Não foi possível processar o arquivo "${file.name}".`));
      reader.readAsDataURL(file);
    });
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalError('');
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        throw new Error('Formato inválido para capa. Utilize PNG, JPG ou WebP.');
      }
      const dataUrl = await readFileAsDataUrl(file);
      setForm((prev) => ({
        ...prev,
        coverImage: dataUrl,
        bannerImage: prev.bannerImage.startsWith('/assets/') ? prev.bannerImage : dataUrl,
      }));
    } catch (err: any) {
      setLocalError(err.message || 'Erro ao carregar imagem de capa.');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handleMultipleFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (!fileList.length) return;

    if (form.attachments.length + fileList.length > 12) {
      setLocalError('Limite máximo de 12 anexos por comunicado.');
      return;
    }

    setReadingFiles(true);
    setLocalError('');

    try {
      const allowedExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'webp'];
      const newAttachments: MuralAttachment[] = [];

      for (const file of fileList) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (!allowedExts.includes(ext)) {
          throw new Error(
            `Arquivo "${file.name}" não permitido. Aceitos: PDF, DOC/DOCX, XLS/XLSX, PNG, JPG, WEBP.`
          );
        }
        const dataUrl = await readFileAsDataUrl(file);
        newAttachments.push({
          name: file.name,
          size: formatBytes(file.size),
          type: ext.toUpperCase(),
          dataUrl,
        });
      }

      setForm((prev) => ({
        ...prev,
        attachments: [...prev.attachments, ...newAttachments],
      }));
    } catch (err: any) {
      setLocalError(err.message || 'Falha ao processar anexos.');
    } finally {
      setReadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (indexToRemove: number) => {
    setForm((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, idx) => idx !== indexToRemove),
    }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleMultipleFiles(e.dataTransfer.files);
    }
  };

  const validateForm = (isDraft: boolean): boolean => {
    if (!form.title.trim()) {
      setLocalError('O título do comunicado é obrigatório.');
      return false;
    }
    if (!isDraft && !form.content.trim()) {
      setLocalError('O conteúdo completo do comunicado é obrigatório para publicação.');
      return false;
    }
    if (!editing.new && !form.editNote.trim()) {
      setLocalError('Informe o motivo da alteração para registro no histórico de governança.');
      return false;
    }
    setLocalError('');
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm(false)) return;
    void onPublish(form);
  };

  const handleSaveDraft = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!validateForm(true)) return;
    void onSaveDraft(form);
  };

  const displayError = localError || serverError;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#080B0D]/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mural-editor-modal-title"
        className="bg-white rounded-2xl shadow-2xl border border-gray-200/90 w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden text-[#080B0D]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pinned Modal Header */}
        <header className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFD400] text-[#080B0D] flex items-center justify-center shadow-xs">
              <Megaphone className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2
                id="mural-editor-modal-title"
                className="text-base sm:text-lg font-black tracking-tight text-[#080B0D]"
              >
                {editing.new ? 'Publicar Comunicado Oficial' : 'Editar Comunicado Oficial'}
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                Mural Corporativo · RODOVAR CONECTA (Gestão Integrada com Neon)
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Fechar janela"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-6">
            {displayError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-800 text-xs font-semibold"
              >
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{displayError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLocalError('')}
                  className="text-red-500 hover:text-red-700 p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* SEÇÃO 1: Dados Principais */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#080B0D]">
                    Título do Comunicado <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-gray-400 font-mono">
                    {form.title.length}/180
                  </span>
                </div>
                <input
                  type="text"
                  required
                  maxLength={180}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Ex: DIRETRIZ OPERACIONAL DE SEGURANÇA E ESCALA DE PLANTÃO"
                  className="w-full px-3.5 py-2.5 text-sm font-semibold border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD400] focus:border-[#FFD400] transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#080B0D]">
                    Resumo Executivo (Exibido no Card e Notificações)
                  </label>
                  <span className="text-[11px] text-gray-400 font-mono">
                    {form.summary.length}/500
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={500}
                  value={form.summary}
                  onChange={(e) => setForm({ ...form, summary: e.target.value })}
                  placeholder="Síntese curta para rápida visualização da equipe..."
                  className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD400] focus:border-[#FFD400] transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#080B0D]">
                    Conteúdo Completo <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-gray-400 font-mono">
                    {form.content.length}/20.000
                  </span>
                </div>
                <textarea
                  rows={6}
                  required
                  maxLength={20000}
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder="Escreva as diretrizes detalhadas, orientações normativas, datas e contatos..."
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD400] focus:border-[#FFD400] transition font-sans leading-relaxed"
                />
              </div>
            </div>

            {/* SEÇÃO 2: Segmentação e Prioridade (Grid 3 Colunas) */}
            <div className="bg-[#F8FAFC] border border-gray-200/90 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200/80">
                <Layers className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-gray-700">
                  Classificação & Destinatários
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Categoria</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-semibold border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD400]"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Prioridade</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-semibold border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD400]"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Público-alvo
                  </label>
                  <select
                    value={form.targetAudience}
                    onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-semibold border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD400]"
                  >
                    {AUDIENCES.map((a) => (
                      <option key={a} value={a}>
                        {a === 'Todos' ? 'Todos os Colaboradores' : a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* SEÇÃO 3: Imagem de Capa e Banner */}
            <div className="bg-[#F8FAFC] border border-gray-200/90 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-200/80">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                    <ImageIcon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#080B0D]">
                      Imagem de Capa & Destaque Visual
                    </h4>
                    <p className="text-[11px] text-gray-500">
                      Formatos aceitos: PNG, JPG ou WebP (máximo 5 MB)
                    </p>
                  </div>
                </div>
                {form.coverImage && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, coverImage: '' })}
                    className="text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remover Capa</span>
                  </button>
                )}
              </div>

              {/* Pré-visualização da Capa se houver */}
              {form.coverImage ? (
                <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-100 max-h-48 flex items-center justify-center group">
                  <img
                    src={form.coverImage}
                    alt="Pré-visualização da Capa"
                    className="w-full h-44 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      className="px-3 py-1.5 bg-white text-gray-800 text-xs font-bold rounded-lg shadow-md hover:bg-gray-100"
                    >
                      Trocar Imagem
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, coverImage: '' })}
                      className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg shadow-md hover:bg-red-700"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 border-2 border-dashed border-gray-300 hover:border-[#FFD400] rounded-xl bg-white hover:bg-[#FFD400]/5 transition cursor-pointer text-xs font-bold text-gray-700"
                  >
                    <UploadCloud className="w-4 h-4 text-gray-500" />
                    <span>Carregar Imagem de Capa do Dispositivo</span>
                  </button>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*, .png, .jpg, .jpeg, .webp, .gif, .bmp, .avif, .ico"
                    className="hidden"
                    onChange={handleCoverUpload}
                  />
                </div>
              )}

              {/* Presets Rápidos Homologados */}
              <div>
                <span className="block text-[11px] font-bold text-gray-600 mb-1.5">
                  Ou selecione do acervo corporativo homologado:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {CORPORATE_PRESETS.map((preset) => {
                    const isSelected = form.coverImage === preset.url;
                    return (
                      <button
                        key={preset.url}
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            coverImage: preset.url,
                            bannerImage: preset.url,
                          }))
                        }
                        className={`text-left p-2 rounded-lg border text-xs font-medium transition cursor-pointer flex items-center gap-2 ${
                          isSelected
                            ? 'bg-[#080B0D] text-[#FFD400] border-[#080B0D] shadow-xs'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <img
                          src={preset.url}
                          alt=""
                          className="w-10 h-7 object-cover rounded shrink-0 border border-black/10"
                        />
                        <span className="truncate">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* SEÇÃO 4: Anexos Múltiplos (PDF, Word, Excel, Imagens) */}
            <div className="bg-[#F8FAFC] border border-gray-200/90 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-200/80">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">
                    <Paperclip className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#080B0D]">
                      Anexos & Documentos Oficiais ({form.attachments.length}/12)
                    </h4>
                    <p className="text-[11px] text-gray-500">
                      PDF, Word (.doc, .docx), Excel (.xls, .xlsx) e Imagens (até 5 MB por arquivo)
                    </p>
                  </div>
                </div>
                {form.attachments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, attachments: [] })}
                    className="text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar Todos</span>
                  </button>
                )}
              </div>

              {/* Upload Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
                  dragActive
                    ? 'border-[#FFD400] bg-[#FFD400]/10'
                    : 'border-gray-300 hover:border-[#FFD400] bg-white hover:bg-gray-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) void handleMultipleFiles(e.target.files);
                  }}
                />
                <div className="w-10 h-10 rounded-full bg-[#FFD400]/20 text-[#080B0D] flex items-center justify-center">
                  <UploadCloud className="w-5 h-5 text-[#080B0D]" />
                </div>
                <div>
                  <span className="text-xs font-bold text-[#080B0D] block">
                    {readingFiles
                      ? 'Processando arquivos...'
                      : 'Clique aqui para selecionar ou arraste arquivos para esta área'}
                  </span>
                  <span className="text-[11px] text-gray-500 block mt-0.5">
                    Permitido anexar múltiplos documentos e imagens de até 5 MB
                  </span>
                </div>
              </div>

              {/* Lista Elegante de Arquivos Anexados */}
              {form.attachments.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {form.attachments.map((file, idx) => {
                      const isImg =
                        file.dataUrl?.startsWith('data:image/') ||
                        ['PNG', 'JPG', 'JPEG', 'WEBP'].includes(file.type?.toUpperCase());
                      return (
                        <div
                          key={file.id || idx}
                          className="flex items-center justify-between gap-3 p-2.5 bg-white border border-gray-200 rounded-xl shadow-2xs hover:border-gray-300 transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isImg && file.dataUrl ? (
                              <img
                                src={file.dataUrl}
                                alt=""
                                className="w-9 h-9 object-cover rounded-lg border border-gray-200 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0">
                                {getFileIcon(file.name || file.type)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p
                                className="text-xs font-bold text-gray-800 truncate"
                                title={file.name}
                              >
                                {file.name}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-gray-100 text-gray-600">
                                  {file.type || 'ARQUIVO'}
                                </span>
                                <span className="text-[10px] text-gray-400 font-mono">
                                  {file.size}
                                </span>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx)}
                            aria-label={`Remover anexo ${file.name}`}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* SEÇÃO 5: Governança & Destaques (Switches Alinhados) */}
            <div className="bg-[#F8FAFC] border border-gray-200/90 rounded-xl p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center gap-2 pb-2.5 border-b border-gray-200/80">
                <div className="w-6 h-6 rounded-lg bg-[#FFD400] text-[#080B0D] flex items-center justify-center font-bold text-xs shadow-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#080B0D]">
                    Configurações de Exibição & Governança
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Controle de fixação, carrossel de banner e auditoria formal de leitura
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                {/* Switch 1: Fixar no topo */}
                <div
                  onClick={() => setForm((f) => ({ ...f, pinned: !f.pinned }))}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                    form.pinned
                      ? 'bg-[#FFD400]/15 border-[#FFD400] shadow-xs'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`p-2 rounded-lg mt-0.5 ${
                        form.pinned ? 'bg-[#FFD400] text-[#080B0D]' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <Pin className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-[#080B0D]">Fixar no Topo</span>
                      <span className="block text-[11px] text-gray-500 mt-0.5 leading-snug">
                        Fixa a publicação no topo do mural para todos.
                      </span>
                    </div>
                  </div>
                  <div
                    className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors duration-200 shrink-0 ${
                      form.pinned ? 'bg-[#080B0D]' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                        form.pinned ? 'translate-x-4 bg-[#FFD400]' : 'translate-x-0 bg-white'
                      }`}
                    />
                  </div>
                </div>

                {/* Switch 2: Destacar no banner */}
                <div
                  onClick={() => setForm((f) => ({ ...f, featured: !f.featured }))}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                    form.featured
                      ? 'bg-[#FFD400]/15 border-[#FFD400] shadow-xs'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`p-2 rounded-lg mt-0.5 ${
                        form.featured
                          ? 'bg-[#FFD400] text-[#080B0D]'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <Megaphone className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-[#080B0D]">
                        Destacar no Banner
                      </span>
                      <span className="block text-[11px] text-gray-500 mt-0.5 leading-snug">
                        Exibe no carrossel de topo com destaque visual.
                      </span>
                    </div>
                  </div>
                  <div
                    className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors duration-200 shrink-0 ${
                      form.featured ? 'bg-[#080B0D]' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                        form.featured ? 'translate-x-4 bg-[#FFD400]' : 'translate-x-0 bg-white'
                      }`}
                    />
                  </div>
                </div>

                {/* Switch 3: Exigir confirmação de leitura */}
                <div
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      requireReadConfirmation: !f.requireReadConfirmation,
                    }))
                  }
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                    form.requireReadConfirmation
                      ? 'bg-[#FFD400]/15 border-[#FFD400] shadow-xs'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`p-2 rounded-lg mt-0.5 ${
                        form.requireReadConfirmation
                          ? 'bg-[#FFD400] text-[#080B0D]'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-[#080B0D]">
                        Exigir Confirmação
                      </span>
                      <span className="block text-[11px] text-gray-500 mt-0.5 leading-snug">
                        Audita a ciência nominal com data e hora.
                      </span>
                    </div>
                  </div>
                  <div
                    className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors duration-200 shrink-0 ${
                      form.requireReadConfirmation ? 'bg-[#080B0D]' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                        form.requireReadConfirmation
                          ? 'translate-x-4 bg-[#FFD400]'
                          : 'translate-x-0 bg-white'
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* SEÇÃO 6: Motivo da Alteração (quando for edição existente) */}
            {!editing.new && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Motivo da Alteração (Histórico de Auditoria){' '}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.editNote}
                  onChange={(e) => setForm({ ...form, editNote: e.target.value })}
                  placeholder="Ex: Atualização do cronograma e ajuste de redação..."
                  className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD400]"
                />
              </div>
            )}
          </div>

          {/* Pinned Modal Footer: NUNCA cobre os campos */}
          <footer className="border-t border-gray-100 bg-[#FAFAFA] px-5 sm:px-6 py-4 flex items-center justify-between gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Ambiente corporativo seguro · Neon PostgreSQL</span>
            </div>

            <div className="flex items-center gap-2.5 ml-auto w-full sm:w-auto justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={handleSaveDraft}
                className="flex-1 sm:flex-none px-4 py-2.5 text-xs font-bold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Salvar Rascunho
              </button>
              <button
                type="submit"
                disabled={busy || !form.title.trim() || !form.content.trim()}
                className="flex-1 sm:flex-none px-5 py-2.5 text-xs font-black text-[#080B0D] bg-[#FFD400] hover:bg-[#ffdf33] rounded-xl transition shadow-xs inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-[#080B0D] border-t-transparent rounded-full animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 stroke-[2.5]" />
                    <span>{editing.new ? 'Publicar Comunicado' : 'Salvar Alterações'}</span>
                  </>
                )}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
};
