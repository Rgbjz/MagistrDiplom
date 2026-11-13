'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserMinus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../lib/api/client';
import { fileUrl } from '../../lib/format';
import type { ChatContact, Conversation, GroupDetails } from '../../lib/types';
import { Avatar, Button, ConfirmDialog, Field, Input, Modal, useToast } from '../ui';
import styles from './group.module.scss';

const json = (body: unknown) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Debounced value: the contact search doesn't hit the API on every key. */
function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/**
 * Search + checklist of people the user may add (shared courses, existing
 * direct chats). `exclude` hides people already in the group.
 */
function MemberPicker({
  selected,
  onChange,
  exclude = [],
}: {
  selected: ChatContact[];
  onChange: (next: ChatContact[]) => void;
  exclude?: number[];
}) {
  const t = useTranslations('chat.group');
  const tr = useTranslations('common.role');
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());
  const { data, isFetching } = useQuery({
    queryKey: ['chat-contacts', q],
    queryFn: () => clientApi<ChatContact[]>(`/chat/contacts?q=${encodeURIComponent(q)}`),
  });
  const people = (data ?? []).filter((p) => !exclude.includes(p.id));
  const isSelected = (id: number) => selected.some((s) => s.id === id);
  const toggle = (p: ChatContact) =>
    onChange(isSelected(p.id) ? selected.filter((s) => s.id !== p.id) : [...selected, p]);

  return (
    <div className={styles.form}>
      <Field label={t('searchLabel')} hint={t('searchHint')}>
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
        />
      </Field>
      {selected.length > 0 && (
        <div className={styles.chips} aria-label={t('selected', { count: selected.length })}>
          {selected.map((p) => (
            <span key={p.id} className={styles.chip}>
              <span>{p.name}</span>
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => toggle(p)}
                aria-label={t('remove', { name: p.name })}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <ul className={styles.results} aria-busy={isFetching} aria-label={t('members')}>
        {people.length === 0 && !isFetching && <li className={styles.empty}>{t('noContacts')}</li>}
        {people.map((p) => (
          <li key={p.id}>
            <label className={styles.person}>
              <input type="checkbox" checked={isSelected(p.id)} onChange={() => toggle(p)} />
              <Avatar src={fileUrl(p.avatarUrl)} name={p.name} size={36} />
              <span className={styles.personText}>
                <span className={styles.personName}>{p.name}</span>
                <span className={styles.personMeta}>
                  {tr(p.role)} · {p.email}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NewGroupDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (conversation: Conversation) => void;
}) {
  const t = useTranslations('chat.group');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [members, setMembers] = useState<ChatContact[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setMembers([]);
      setError(null);
    }
  }, [open]);

  const create = useMutation({
    mutationFn: () =>
      clientApi<Conversation>('/chat/groups', {
        method: 'POST',
        ...json({ title: title.trim(), memberIds: members.map((m) => m.id) }),
      }),
    onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast(t('created', { title: conversation.title }));
      onCreated(conversation);
    },
    onError: () => setError(t('createFailed')),
  });

  function submit() {
    if (!title.trim()) return setError(t('nameRequired'));
    if (!members.length) return setError(t('membersRequired'));
    setError(null);
    create.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('createTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            {create.isPending ? t('creating') : t('create')}
          </Button>
        </>
      }
    >
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={t('name')}>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('namePlaceholder')}
            maxLength={80}
            required
          />
        </Field>
        <MemberPicker selected={members} onChange={setMembers} />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

export function GroupSettingsDialog({
  open,
  onClose,
  conversation,
  meId,
  onLeft,
}: {
  open: boolean;
  onClose: () => void;
  conversation: Conversation;
  meId: number | undefined;
  onLeft: () => void;
}) {
  const t = useTranslations('chat.group');
  const tr = useTranslations('common.role');
  const toast = useToast();
  const queryClient = useQueryClient();
  const id = conversation.id;
  const key = ['chat-group', id];
  const { data: group } = useQuery({
    queryKey: key,
    queryFn: () => clientApi<GroupDetails>(`/chat/groups/${id}`),
    enabled: open,
  });
  const isOwner = !!group && group.ownerId === meId;
  const [title, setTitle] = useState(conversation.title);
  const [adding, setAdding] = useState<ChatContact[]>([]);
  const [removing, setRemoving] = useState<ChatContact | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (group) setTitle(group.title);
  }, [group]);

  const refresh = (next?: GroupDetails) => {
    if (next) queryClient.setQueryData(key, next);
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };
  const fail = () => toast(t('actionFailed'), 'error');

  const rename = useMutation({
    mutationFn: () =>
      clientApi<GroupDetails>(`/chat/groups/${id}`, { method: 'PATCH', ...json({ title: title.trim() }) }),
    onSuccess: (g) => {
      refresh(g);
      toast(t('renamed'));
    },
    onError: fail,
  });
  const add = useMutation({
    mutationFn: () =>
      clientApi<GroupDetails>(`/chat/groups/${id}/members`, {
        method: 'POST',
        ...json({ userIds: adding.map((m) => m.id) }),
      }),
    onSuccess: (g) => {
      refresh(g);
      setAdding([]);
      toast(t('added'));
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (userId: number) =>
      clientApi<GroupDetails>(`/chat/groups/${id}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: (g) => {
      refresh(g);
      setRemoving(null);
      toast(t('removed'));
    },
    onError: fail,
  });
  const leave = useMutation({
    mutationFn: () => clientApi(`/chat/groups/${id}/leave`, { method: 'POST' }),
    onSuccess: () => {
      setLeaving(false);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast(t('left'));
      onLeft();
    },
    onError: fail,
  });

  const members = group?.members ?? [];

  return (
    <>
      <Modal
        open={open && !removing && !leaving}
        onClose={onClose}
        title={t('settingsTitle', { title: group?.title ?? conversation.title })}
        footer={
          <>
            <Button variant="danger" onClick={() => setLeaving(true)}>
              {t('leave')}
            </Button>
            <Button variant="outline" onClick={onClose}>
              {t('close')}
            </Button>
          </>
        }
      >
        {isOwner && (
          <form
            className={styles.renameRow}
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim() && title.trim() !== group?.title) rename.mutate();
            }}
          >
            <Field label={t('name')}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
            </Field>
            <Button
              type="submit"
              variant="outline"
              loading={rename.isPending}
              disabled={!title.trim() || title.trim() === group?.title}
            >
              {t('save')}
            </Button>
          </form>
        )}

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            {t('members')} · {t('memberCount', { count: members.length })}
          </h3>
          <ul className={styles.members}>
            {members.map((m) => (
              <li key={m.id} className={styles.member}>
                <Avatar src={fileUrl(m.avatarUrl)} name={m.name} size={36} />
                <span className={styles.personText}>
                  <span className={styles.personName}>
                    {m.name}
                    {m.id === group?.ownerId && <span className={styles.badge}>{t('owner')}</span>}
                    {m.id === meId && <span className={styles.badge}>{t('you')}</span>}
                  </span>
                  <span className={styles.personMeta}>
                    {tr(m.role)} · {m.email}
                  </span>
                </span>
                {isOwner && m.id !== meId && (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => setRemoving(m)}
                    aria-label={`${t('removeMember')}: ${m.name}`}
                    title={t('removeMember')}
                  >
                    <UserMinus size={18} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {isOwner && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('addMembers')}</h3>
            <MemberPicker selected={adding} onChange={setAdding} exclude={members.map((m) => m.id)} />
            <Button
              variant="outline"
              onClick={() => add.mutate()}
              disabled={!adding.length}
              loading={add.isPending}
            >
              {t('add')}
            </Button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!removing}
        title={t('removeConfirm', { name: removing?.name ?? '' })}
        confirmLabel={t('removeMember')}
        danger
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
        onCancel={() => setRemoving(null)}
      />
      <ConfirmDialog
        open={leaving}
        title={t('leaveConfirm', { title: group?.title ?? conversation.title })}
        description={t('leaveText')}
        confirmLabel={t('leave')}
        danger
        loading={leave.isPending}
        onConfirm={() => leave.mutate()}
        onCancel={() => setLeaving(false)}
      />
    </>
  );
}
