import { useTranslation } from 'react-i18next'
import classNames from 'classnames'

import './index.scss'

import { hasStatus } from 'frontend/hooks/hasStatus'

import BackHint from '../BackHint'

import type { GameInfo, Runner } from 'common/types'
import { useCallback, useContext, useEffect, useState } from 'react'
import { useCancelOnHold, useGamepadButtonHold } from '../../hooks'
import { BTN_BACK } from '../../controller'
import { launch, sendKill } from 'frontend/helpers'
import ContextProvider from 'frontend/state/ContextProvider'

const CANCEL_HOLD_MS = 3000

export default function LaunchOverlay({
  game,
  onDismiss
}: {
  game: GameInfo
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const { status, statusContext } = hasStatus(game)
  let label: string | null = null

  const { showDialogModal } = useContext(ContextProvider)
  const [launchError, setLaunchError] = useState<string | null>(null)

  const handleDismiss = useCallback(() => {
    onDismiss()
  }, [onDismiss])

  // Hold-to-cancel for in-flight launches. Triggered by Escape (keyboard) or
  // the back button (gamepad); fires `sendKill` after CANCEL_HOLD_MS.
  const { holdStart, startHold, stopHold } = useCancelOnHold({
    active: !launchError && !!game,
    holdMs: CANCEL_HOLD_MS,
    onCancel: () => {
      if (game) void sendKill(game.app_name, game.runner)
      handleDismiss()
    }
  })

  // Escape quits when idle; hold it while launching to cancel.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (!e.repeat) startHold()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stopHold()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [startHold, stopHold])

  // Fire the launch exactly once on mount; the overlay closes via onDismiss.
  useEffect(() => {
    void launch({
      appName: game.app_name,
      t,
      runner: game.runner as Runner,
      hasUpdate: false,
      showDialogModal
    }).then((result) => {
      if (result.status === 'error') {
        let msg = t('console.launchError', 'Failed to launch game. Check the logs for details.')
        if (result.error) {
          if (result.error.includes('not logged in') || result.error.includes('aurelia login')) {
            msg = t('console.launchErrorNotLoggedIn', 'Failed to launch game. You must log in to Steam first.')
          } else {
            msg = `${t('console.launchErrorPrefix', 'Failed to launch game:')} ${result.error}`
          }
        }
        setLaunchError(msg)
        setTimeout(() => handleDismiss(), result.error ? 5000 : 3000)
        return
      }
      handleDismiss()
    }).catch((err) => {
      const errMsg = err instanceof Error ? err.message : String(err)
      let msg = t('console.launchError', 'Failed to launch game. Check the logs for details.')
      if (errMsg && (errMsg.includes('not logged in') || errMsg.includes('aurelia login'))) {
        msg = t('console.launchErrorNotLoggedIn', 'Failed to launch game. You must log in to Steam first.')
      } else if (errMsg) {
        msg = `${t('console.launchErrorPrefix', 'Failed to launch game:')} ${errMsg}`
      }
      setLaunchError(msg)
      setTimeout(() => handleDismiss(), errMsg ? 5000 : 3000)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useGamepadButtonHold(
    BTN_BACK,
    (held) => (held ? startHold() : stopHold()),
    !!game
  )

  switch (status) {
    case 'syncing-saves':
      label = t('gamepage:status.syncingSaves', 'Syncing Saves')
      break
    case 'redist':
      label = t(
        'gamepage:status.redist',
        'Installing Redistributables ({{redist}})',
        { redist: statusContext || '' }
      )
      break
    case 'winetricks':
      label = t('gamepage:status.winetricks', 'Applying Winetricks fixes')
      break
    case 'launching':
      label = t('gamepage:status.launching', 'Launching')
      break
    case 'playing':
      label = t('gamepage:status.playing', 'Playing')
      break
  }

  return (
    <div className="consoleLaunchOverlay" role="status" aria-live="polite">
      {launchError ? (
        <div className="consoleLaunchError">
          <div className="consoleLaunchErrorIcon">!</div>
          <div className="consoleLaunchErrorText">{launchError}</div>
        </div>
      ) : (
        <>
          <div
            className={classNames('consoleLaunchSpinner', {
              idle: status === 'playing'
            })}
          />
          <div className="consoleLaunchText">
            {label || t('console.launching', 'Launching')}
          </div>
          <div className="consoleLaunchGameTitle">
            {game.overrides?.title || game.title}
          </div>
          <BackHint
            prefix={t('console.cancel.hintPrefix', 'Hold')}
            suffix={t('console.cancel.hintSuffix', 'for 3s to cancel')}
            active={holdStart != null}
          />
        </>
      )}
    </div>
  )
}
