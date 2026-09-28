import { useRef, useState } from 'react';

import { CompactText } from '@/components/compact-text';
import { CountryFlag } from '@/components/country-flag';
import { ErrorNotice, Pending } from '@/components/toolkit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { t } from '@/i18n';

import type { PingNode } from './api';
import { regionNames } from './region-names';

const CUSTOM_LIMIT = 50;
const BATCH = 40;

export function RegionPickerDialog({
  nodes,
  catalogPending,
  catalogError,
  selected,
  onSelected,
  onApply,
  active,
  disabled,
}: {
  nodes: PingNode[];
  catalogPending: boolean;
  catalogError: unknown;
  selected: string[];
  onSelected: (update: (previous: string[]) => string[]) => void;
  onApply: () => void;
  active: boolean;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(BATCH);
  const listRef = useRef<HTMLDivElement>(null);

  const shown = open
    ? nodes.filter((node) =>
        `${regionNames.of(node.cc.toUpperCase())} ${node.city} ${node.cc}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      )
    : [];

  const addShown = () =>
    onSelected((previous) =>
      [...new Set([...previous, ...shown.map((node) => node.id)])].slice(0, CUSTOM_LIMIT)
    );

  const toggle = (node: PingNode, checked: boolean | string) =>
    onSelected((previous) =>
      checked
        ? [...new Set([...previous, node.id])].slice(0, CUSTOM_LIMIT)
        : previous.filter((id) => id !== node.id)
    );

  const grow = () => setVisibleCount((count) => Math.min(count + BATCH, shown.length));

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) setVisibleCount(BATCH);
      }}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant={active ? 'secondary' : 'ghost'}
          className={
            active
              ? 'bg-primary/15 text-primary border border-primary/30 font-semibold shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }
          disabled={disabled}>
          {t('自定义地区')}
          {selected.length ? ` (${selected.length})` : ''}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('自定义探测地区')}</DialogTitle>
          <DialogDescription>
            {t('按国家或城市搜索，每个城市选择一个在线探针；自定义最多选择 50 个城市。')}
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder={t('搜索国家 / 城市')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setVisibleCount(BATCH);
            listRef.current?.scrollTo({ top: 0 });
          }}
        />
        <div className="flex items-center justify-between text-xs">
          <span>
            {t('已选')}
            {selected.length}
            {t('个地区')}
          </span>
          <div>
            <Button variant="ghost" size="sm" onClick={addShown}>
              {t('添加搜索结果（最多 50 个）')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onSelected(() => [])}>
              {t('清空')}
            </Button>
          </div>
        </div>
        <ErrorNotice error={catalogError} />
        {catalogPending ? (
          <Pending>{t('加载在线地区...')}</Pending>
        ) : (
          <div
            ref={listRef}
            className="grid max-h-80 grid-cols-1 gap-2 overflow-auto sm:grid-cols-2"
            onScroll={(event) => {
              const list = event.currentTarget;
              if (list.scrollHeight - list.scrollTop - list.clientHeight < 100) grow();
            }}>
            {shown.slice(0, visibleCount).map((node) => (
              <label key={node.id} className="flex min-w-0 items-center gap-2 text-xs">
                <Checkbox
                  checked={selected.includes(node.id)}
                  disabled={!selected.includes(node.id) && selected.length >= CUSTOM_LIMIT}
                  onCheckedChange={(checked) => toggle(node, checked)}
                />
                <CountryFlag code={node.cc} />
                <CompactText text={`${regionNames.of(node.cc.toUpperCase())} · ${node.city}`} />
              </label>
            ))}
            {!shown.length && (
              <p className="col-span-full py-4 text-center text-muted-foreground">
                {t('没有匹配的地区')}
              </p>
            )}
            {visibleCount < shown.length && (
              <Button variant="ghost" size="sm" className="col-span-full" onClick={grow}>
                {t('加载更多（已显示')}
                {Math.min(visibleCount, shown.length)} / {shown.length}）
              </Button>
            )}
          </div>
        )}
        <Button
          disabled={!selected.length}
          onClick={() => {
            onApply();
            setOpen(false);
          }}>
          {t('使用所选地区')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function PresetRegionDetails({
  regions,
  scope,
  fullCoverage,
  presetNodes,
}: {
  regions: { id: string; name: string }[];
  scope: string;
  fullCoverage: boolean;
  presetNodes: PingNode[];
}) {
  const shown = regions.filter(
    (region) => scope === 'world' || region.id === scope || (!fullCoverage && region.id === 'AS')
  );
  return (
    <div className="space-y-2">
      {shown.map((region) => {
        const items = presetNodes.filter((node) => node.continent === region.id);
        if (!items.length) return null;
        return (
          <details key={region.id} className="text-xs">
            <summary className="cursor-pointer py-1 text-muted-foreground">
              {region.name} · {items.length}
              {t('个探测地区')}
            </summary>
            <div className="flex max-h-40 flex-wrap gap-1 overflow-auto pt-2">
              {items.map((node) => (
                <Badge key={node.id} variant="secondary">
                  <CountryFlag code={node.cc} />
                  <CompactText
                    text={`${regionNames.of(node.cc.toUpperCase())} · ${node.city}${!fullCoverage && node.preferredNetwork ? ` · ${node.preferredNetwork}` : ''}`}
                  />
                </Badge>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
