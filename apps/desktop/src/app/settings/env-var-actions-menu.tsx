import type * as React from 'react'

import {
  type ActionItemSpec,
  ActionsContextMenu,
  ActionsMenu,
  type MenuKit,
  renderActionItem
} from '@/components/ui/actions-menu'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { ExternalLink, Eye, EyeOff, Trash2 } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface EnvVarActions {
  clearDisabled?: boolean
  docsUrl?: string | null
  isRevealed?: boolean
  isSet: boolean
  label: string
  onClear?: () => void
  onEdit: () => void
  onReveal?: () => void
  showReveal?: boolean
}

function useEnvVarItems({
  clearDisabled = false,
  docsUrl,
  isRevealed = false,
  isSet,
  onClear,
  onEdit,
  onReveal,
  showReveal = true
}: EnvVarActions) {
  const { t } = useI18n()
  const copy = t.settings.envActions
  const hasClear = isSet && onClear
  const hasReveal = isSet && showReveal && onReveal
  const hasDocs = Boolean(docsUrl?.trim())

  return (kit: MenuKit) => {
    const rows: ActionItemSpec[] = []

    if (hasDocs) {
      rows.push({
        iconNode: <ExternalLink className="size-3.5" />,
        key: 'docs',
        label: copy.docs,
        onSelect: event => {
          event.preventDefault()
          triggerHaptic('selection')
          window.open(docsUrl!, '_blank', 'noopener,noreferrer')
        }
      })
    }

    if (hasReveal) {
      rows.push({
        iconNode: isRevealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />,
        key: 'reveal',
        label: isRevealed ? copy.hideValue : copy.revealValue,
        onSelect: () => {
          triggerHaptic('selection')
          onReveal()
        }
      })
    }

    rows.push({
      icon: 'edit',
      key: 'edit',
      label: isSet ? copy.replace : copy.set,
      onSelect: () => {
        triggerHaptic('selection')
        onEdit()
      }
    })

    return (
      <>
        {rows.map(row => renderActionItem(kit, row))}
        {hasClear && (
          <>
            <kit.Separator />
            {renderActionItem(kit, {
              disabled: clearDisabled,
              iconNode: <Trash2 className="size-3.5" />,
              key: 'clear',
              label: copy.clear,
              onSelect: () => {
                triggerHaptic('warning')
                onClear()
              },
              variant: 'destructive'
            })}
          </>
        )}
      </>
    )
  }
}

interface EnvVarActionsMenuProps
  extends EnvVarActions, Pick<React.ComponentProps<typeof ActionsMenu>, 'align' | 'sideOffset'> {
  children: React.ReactNode
}

export function EnvVarActionsMenu({ align = 'end', children, sideOffset = 6, ...actions }: EnvVarActionsMenuProps) {
  const { t } = useI18n()
  const items = useEnvVarItems(actions)

  return (
    <ActionsMenu
      align={align}
      ariaLabel={t.settings.envActions.actionsFor(actions.label)}
      contentClassName="w-44"
      items={items}
      sideOffset={sideOffset}
    >
      {children}
    </ActionsMenu>
  )
}

interface EnvVarContextMenuProps extends EnvVarActions {
  children: React.ReactNode
}

export function EnvVarContextMenu({ children, ...actions }: EnvVarContextMenuProps) {
  const { t } = useI18n()
  const items = useEnvVarItems(actions)

  return (
    <ActionsContextMenu
      ariaLabel={t.settings.envActions.actionsFor(actions.label)}
      contentClassName="w-44"
      items={items}
    >
      {children}
    </ActionsContextMenu>
  )
}

interface EnvVarActionsTriggerProps extends Omit<React.ComponentProps<typeof Button>, 'size' | 'variant'> {
  label: string
}

export function EnvVarActionsTrigger({ className, label, ...props }: EnvVarActionsTriggerProps) {
  const { t } = useI18n()
  const copy = t.settings.envActions

  return (
    <Button
      aria-label={copy.actionsFor(label)}
      className={cn('text-muted-foreground hover:text-foreground', className)}
      size="icon-sm"
      title={copy.credentialActions}
      variant="ghost"
      {...props}
    >
      <Codicon name="ellipsis" size="0.875rem" />
    </Button>
  )
}
