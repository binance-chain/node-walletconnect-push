import fastify from 'fastify'
import helmet from 'fastify-helmet'
import axios from 'axios'

import config from './config/index'
import { setClientDetails, getClientDetails } from './keystore'
import { formatMessage } from './i18n'
import { ClientDetails } from './types'

const fcmApi = axios.create({
  baseURL: config.fcm.url,
  timeout: 3000,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `key=${config.fcm.apiKey}`
  }
})

const app = fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || undefined,
  }
})

app.register(helmet)

// for container health checks
app.get('/health', (_, res) => {
  res.status(204).send()
})

app.post('/new', async (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    res.status(400).send({
      message: 'Error: missing or invalid request body'
    })
    return
  }

  const { bridge, topic, type, token, peerName, language } = req.body

  if (!topic || typeof topic !== 'string') {
    res.status(400).send({
      message: 'Error: missing or invalid topic field'
    })
    return
  }

  if (!type || typeof type !== 'string') {
    res.status(400).send({
      message: 'Error: missing or invalid type field'
    })
    return
  }

  if (!token || typeof token !== 'string') {
    res.status(400).send({
      message: 'Error: missing or invalid token field'
    })
    return
  }

  if (!peerName || typeof peerName !== 'string') {
    res.status(400).send({
      message: 'Error: missing or invalid peerName field'
    })
    return
  }

  if (!language || typeof language !== 'string') {
    res.status(400).send({
      message: 'Error: missing or invalid language field'
    })
    return
  }

  const clientDetails: ClientDetails = { type, token, peerName, language }

  try {
    await setClientDetails(topic, clientDetails)

    const webhook = `${config.host}/push`

    const { data } = await axios.post(`${bridge}/subscribe`, { topic, webhook })

    if (!data.success) {
      res.status(400).send({
        message: 'Error: failed to subscribe to bridge server'
      })
      return
    }

    res.status(200).send({
      success: true
    })
    return
  } catch (error) {
    res.status(400).send({
      message: 'Error: failed to save client details'
    })
    return
  }
})

app.post('/push', async (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    res.status(400).send({
      message: 'Error: missing or invalid request body'
    })
    return
  }  
  
  const { topic } = req.body

  if (!topic || typeof topic !== 'string') {
    res.status(400).send({
      message: 'Error: missing or invalid topic field'
    })
    return
  }

  const clientDetails = await getClientDetails(topic)

  if (!clientDetails) {
    res.status(400).send({
      message: 'Error: failed to get client details'
    })
    return
  }

  const { type, token, peerName, language } = clientDetails

  switch (type.toLowerCase()) {
    case 'fcm':
      const body = formatMessage(peerName, language)

      const notification = {
        to: token,
        notification: {
          body: body
        }
      }

      try {
        const response = await fcmApi.post('', notification)
        if (
          response.status === 200 &&
          response.data &&
          response.data.success === 1
        ) {
          res.status(200).send({
            success: true
          })
          return
        } else {
          res.status(400).send({
            message: 'Error: failed to push notification'
          })
          return
        }
      } catch (e) {
        res.status(400).send({
          message: 'Error: failed to push notification'
        })
        return
      }
    default:
      res.status(400).send({
        message: 'Error: push notifcation type not supported'
      })
      return
  }
})

const [host, port] = config.host.split(':')
app.listen(+port, host, (err, address) => {
  if (err) throw err
  console.log(`Server listening on ${address}`)
  app.log.info(`Server listening on ${address}`)
})
