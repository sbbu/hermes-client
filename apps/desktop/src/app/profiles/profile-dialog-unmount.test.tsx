import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { CreateProfileDialog } from './create-profile-dialog'
import { RenameProfileDialog } from './rename-profile-dialog'

const hermesMocks = vi.hoisted(() => ({
  createProfile: vi.fn(),
  renameProfile: vi.fn(),
  updateProfileSoul: vi.fn()
}))

vi.mock('@/hermes', () => hermesMocks)

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: {
      common: { cancel: 'Cancel' },
      profiles: {
        cloneFrom: 'Clone from',
        cloneFromDesc: 'Clone an existing profile',
        cloneFromNone: 'None',
        createAction: 'Create',
        createDesc: 'Create a profile',
        created: 'Created',
        creating: 'Creating',
        failedCreate: 'Create failed',
        failedRename: 'Rename failed',
        invalidName: (hint: string) => hint,
        nameHint: 'Use letters and numbers',
        nameLabel: 'Name',
        nameRequired: 'Name required',
        newNameLabel: 'New name',
        newProfile: 'New profile',
        rename: 'Rename',
        renameDescPrefix: 'Rename ',
        renameDescSuffix: '',
        renamed: 'Renamed',
        renameTitle: 'Rename profile',
        renaming: 'Renaming',
        soulOptional: 'optional',
        soulPlaceholder: (value: string) => value,
        soulPlaceholderCloned: 'Keep cloned soul',
        soulPlaceholderEmpty: 'No soul'
      }
    }
  })
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void

  const promise = new Promise<void>(done => {
    resolve = done
  })

  return { promise, resolve }
}

test('create completion cannot publish callbacks or a close after unmount', async () => {
  vi.useFakeTimers()

  const pending = deferred()
  const onClose = vi.fn()
  const onCreated = vi.fn()

  hermesMocks.createProfile.mockReturnValueOnce(pending.promise)

  const { unmount } = render(<CreateProfileDialog onClose={onClose} onCreated={onCreated} open profiles={[]} />)

  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'new-profile' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create' }))
  unmount()
  pending.resolve()
  await Promise.resolve()
  await Promise.resolve()
  vi.advanceTimersByTime(1000)

  expect(onCreated).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
})

test('rename completion cannot publish callbacks or a close after unmount', async () => {
  vi.useFakeTimers()

  const pending = deferred()
  const onClose = vi.fn()
  const onRenamed = vi.fn()

  hermesMocks.renameProfile.mockReturnValueOnce(pending.promise)

  const { unmount } = render(
    <RenameProfileDialog currentName="old-profile" onClose={onClose} onRenamed={onRenamed} open />
  )

  fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'new-profile' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
  unmount()
  pending.resolve()
  await Promise.resolve()
  await Promise.resolve()
  vi.advanceTimersByTime(1000)

  expect(onRenamed).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
})
