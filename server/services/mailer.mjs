import tls from 'node:tls'
import net from 'node:net'

/**
 * Lightweight, dependency-free SMTP and notification dispatcher.
 * Handles company email notifications (e.g. sales@heymandiamond.com)
 * with graceful logging fallback when SMTP is not configured in local dev.
 */

function getSmtpConfig() {
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST || ''
  const port = Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 465)
  const user = process.env.SMTP_USER || process.env.MAIL_USER || ''
  const pass = process.env.SMTP_PASS || process.env.MAIL_PASS || ''
  const from = process.env.SMTP_FROM || process.env.MAIL_FROM || 'sales@heymandiamond.com'
  const secure = process.env.SMTP_SECURE != null ? process.env.SMTP_SECURE === 'true' : port === 465
  return { host, port, user, pass, from, secure }
}

/**
 * Sends an email using low-level SMTP or logs to console if unconfigured.
 */
export async function sendEmailNotification({ to, from, replyTo, subject, text, html }) {
  const config = getSmtpConfig()
  const recipient = String(to || '').trim()
  const sender = String(from || config.from || 'sales@heymandiamond.com').trim()
  const cleanSubject = String(subject || 'Hey Man Diamond LLC Notification').replace(/[\r\n]+/g, ' ').trim()

  if (!recipient) {
    console.warn('[Mailer] Missing recipient email address.')
    return { sent: false, error: 'Recipient address required.' }
  }

  // If SMTP credentials are not configured, log email payload cleanly and return success
  if (!config.host || !config.user || !config.pass) {
    console.info(`[Mailer:DEV/LOG] To: ${recipient} | From: ${sender} | Subject: "${cleanSubject}"`)
    console.info(`[Mailer:DEV/LOG] Message Body:\n${text || html || '(empty)'}\n---`)
    return { sent: true, mode: 'logged', recipient }
  }

  // Build RFC 5322 message
  const dateStr = new Date().toUTCString()
  const messageLines = [
    `From: Hey Man Diamond LLC <${sender}>`,
    `To: <${recipient}>`,
    replyTo ? `Reply-To: <${replyTo}>` : null,
    `Subject: ${cleanSubject}`,
    `Date: ${dateStr}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    '',
    text || '',
    '',
  ].filter(line => line !== null).join('\r\n')

  return new Promise(resolve => {
    let socket = null
    let step = 0
    let buffer = ''
    let finished = false

    const cleanup = () => {
      if (socket && !socket.destroyed) {
        socket.destroy()
      }
    }

    const finish = (result) => {
      if (finished) return
      finished = true
      cleanup()
      resolve(result)
    }

    // Set connection timeout (10 seconds)
    const timeout = setTimeout(() => {
      finish({ sent: false, error: 'SMTP connection timed out', mode: 'timeout' })
    }, 10000)

    const onData = (data) => {
      buffer += data.toString()
      const lines = buffer.split('\r\n')
      buffer = lines.pop() // keep incomplete last line

      for (const line of lines) {
        const code = parseInt(line.slice(0, 3), 10)
        // Check for multi-line replies (e.g. 250-...)
        if (line.charAt(3) === '-') continue

        if (step === 0 && code === 220) {
          step = 1
          socket.write(`EHLO heymandiamond.com\r\n`)
        } else if (step === 1 && code === 250) {
          step = 2
          socket.write(`AUTH LOGIN\r\n`)
        } else if (step === 2 && code === 334) {
          step = 3
          socket.write(`${Buffer.from(config.user).toString('base64')}\r\n`)
        } else if (step === 3 && code === 334) {
          step = 4
          socket.write(`${Buffer.from(config.pass).toString('base64')}\r\n`)
        } else if (step === 4 && code === 235) {
          step = 5
          socket.write(`MAIL FROM:<${sender}>\r\n`)
        } else if (step === 5 && code === 250) {
          step = 6
          socket.write(`RCPT TO:<${recipient}>\r\n`)
        } else if (step === 6 && code === 250) {
          step = 7
          socket.write(`DATA\r\n`)
        } else if (step === 7 && code === 354) {
          step = 8
          socket.write(`${messageLines}\r\n.\r\n`)
        } else if (step === 8 && code === 250) {
          step = 9
          socket.write(`QUIT\r\n`)
          clearTimeout(timeout)
          finish({ sent: true, mode: 'smtp', recipient })
        } else if (code >= 400) {
          clearTimeout(timeout)
          console.warn(`[Mailer:SMTP ERROR ${code}] ${line}`)
          finish({ sent: false, error: line, mode: 'smtp_error' })
          return
        }
      }
    }

    try {
      if (config.secure) {
        socket = tls.connect({ host: config.host, port: config.port, timeout: 8000 }, () => {
          socket.on('data', onData)
        })
      } else {
        socket = net.connect({ host: config.host, port: config.port, timeout: 8000 }, () => {
          socket.on('data', onData)
        })
      }

      socket.on('error', (err) => {
        clearTimeout(timeout)
        console.warn('[Mailer:Socket Error]', err.message)
        finish({ sent: false, error: err.message, mode: 'socket_error' })
      })
    } catch (err) {
      clearTimeout(timeout)
      finish({ sent: false, error: err.message, mode: 'connection_exception' })
    }
  })
}
