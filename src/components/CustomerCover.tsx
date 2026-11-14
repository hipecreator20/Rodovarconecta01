import React, { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus } from 'lucide-react';
import { getAuthHeaders, sanitizeApiErrorMessage } from '../lib/serverApi';
import {
  appQueryClient,
  FREIGHT_CACHE_TIMES,
  fetchCustomerCoversQuery,
  freightQueryKeys,
  invalidateCustomerCoversCache,
} from '../lib/freightQueryCache';
import { processImageFileForUpload } from '../lib/imageUploadUtils';
import './CustomerCover.css';

const key = (s: string) =>
  s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

export function CustomerCover({
  customer,
  userId,
}: {
  customer: string;
  userId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const queryKey = freightQueryKeys.customerCovers(userId || 'session');
  const { data } = useQuery({
    queryKey,
    queryFn: fetchCustomerCoversQuery,
    staleTime: FREIGHT_CACHE_TIMES.STATIC_DATA_STALE_MS,
    gcTime: FREIGHT_CACHE_TIMES.STATIC_DATA_STALE_MS,
    refetchOnWindowFocus: false,
  });

  const image = data?.covers?.find((c) => c.key === key(customer))?.dataUrl || '';
  const canEdit = Boolean(data?.canEdit);

  async function upload(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      const processed = await processImageFileForUpload(file, {
        maxWidth: 1200,
        maxHeight: 800,
        maxDataUrlBytes: 1_500_000,
      });

      const r = await fetch('/api/customer-covers', {
        method: 'PUT',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify({ customer, dataUrl: processed.dataUrl }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.cover) {
        throw Error(d?.error || 'Não foi possível salvar a capa.');
      }

      // Optimistic cache update so the new cover displays immediately across all matching cards
      appQueryClient.setQueryData<{
        covers: { key: string; customer: string; dataUrl: string }[];
        canEdit: boolean;
      }>(queryKey, (prev) => {
        const currentCovers = prev?.covers ? [...prev.covers] : [];
        const idx = currentCovers.findIndex((c) => c.key === d.cover.key);
        if (idx >= 0) {
          currentCovers[idx] = d.cover;
        } else {
          currentCovers.push(d.cover);
        }
        return {
          covers: currentCovers,
          canEdit: prev?.canEdit ?? true,
        };
      });

      await invalidateCustomerCoversCache();
    } catch (e) {
      setError(sanitizeApiErrorMessage(e, 'Não foi possível salvar a capa.'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="customer-cover" onClick={(e) => e.stopPropagation()}>
      <img
        src={image || '/assets/banner-rodovar-conecta-highway.png'}
        alt={image ? `Capa de ${customer}` : ''}
        width="500"
        height="255"
        loading="lazy"
        decoding="async"
      />
      <span className="customer-cover-caption">
        {image ? 'Capa do cliente' : 'Imagem institucional Rodovar'}
      </span>
      {canEdit && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            aria-label={`Trocar capa de ${customer}`}
            title="Salva a capa para todos os fretes deste cliente"
          >
            <ImagePlus size={14} />
            {busy ? 'Salvando…' : 'Trocar capa'}
          </button>
          <input
            ref={input}
            hidden
            type="file"
            accept="image/*, .png, .jpg, .jpeg, .webp, .gif, .bmp, .avif, .ico"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
