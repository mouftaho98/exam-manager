/**
 * Scans the barcode on a student ID card with the phone camera and reports
 * what it read (the student number). Cameras only work over HTTPS or on
 * localhost.
 */
import { useEffect, useRef, useState } from 'react'
import { Alert, Modal, Stack, Text } from '@mantine/core'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

const FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
]

export default function CardScanner({ opened, onClose, onScan }: { opened: boolean; onClose: () => void; onScan: (text: string) => void }) {
  const [error, setError] = useState('')
  const scanner = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    if (!opened) return
    setError('')
    // Wait for the modal to render the target div before starting the camera.
    const timer = setTimeout(() => {
      const s = new Html5Qrcode('card-reader', { formatsToSupport: FORMATS, verbose: false })
      scanner.current = s
      s.start({ facingMode: 'environment' }, { fps: 15 }, (text) => { stop(); onScan(text.trim()) }, () => {})
        .catch((e) => setError(`Could not start the camera: ${e?.message ?? e}`))
    }, 200)
    const stop = () => {
      const s = scanner.current
      scanner.current = null
      s?.stop().then(() => s.clear()).catch(() => {})
    }
    return () => { clearTimeout(timer); stop() }
  }, [opened, onScan])

  return (
    <Modal opened={opened} onClose={onClose} title="Scan student card">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">Point the camera at the barcode on the student's ID card.</Text>
        <div id="card-reader" style={{ width: '100%' }} />
        {error && <Alert color="red">{error}</Alert>}
      </Stack>
    </Modal>
  )
}
