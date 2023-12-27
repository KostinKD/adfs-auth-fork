import { createError } from 'h3'
import { ofetch } from 'ofetch'
import { snakeCase } from 'scule'
import { normalizeURL } from 'ufo'
import { useLogger } from '@nuxt/kit'
import { genBase64FromString, parseJwtToken } from './security'
import { createDefu } from 'defu'
import * as providerPresets from '../../providers'
import type { H3Event, H3Error } from 'h3'
import type { OidcProviderConfig, ProviderKeys, RefreshTokenRequest, TokenRequest, TokenRespose } from '../../types/oidc'
import type { UserSession } from '../../types/session'

const logger = useLogger('oidc-auth')

// Custom defu config merger to replace default values instead of merging them, except for requiredProperties
export const configMerger = createDefu((obj, key, value) => {
  if (Array.isArray(obj[key]) && Array.isArray(value)) {
    obj[key] = key === 'requiredProperties' ? Array.from(new Set(obj[key].concat(value))) : value as any
    return true
  }
})

export async function refreshAccessToken(provider: ProviderKeys, refreshToken: string) {
  const config = configMerger(useRuntimeConfig().oidc.providers[provider] as OidcProviderConfig, providerPresets[provider])
  // Construct request header object
  const headers: HeadersInit = {}

  // Validate if authentication information should be send in header or body
  if (config.authenticationScheme === 'header') {
    const encodedCredentials = genBase64FromString(`${config.clientId}:${config.clientSecret}`)
    headers.authorization = `Basic ${encodedCredentials}`
  }

  // Construct form data for refresh token request
  const requestBody: RefreshTokenRequest = {
    client_id: config.clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    ...(config.scopeInTokenRequest && config.scope) && { scope: config.scope.join(' ') },
    ...(config.authenticationScheme === 'body') && { client_secret: normalizeURL(config.clientSecret) }
  }
  const requestForm = generateFormDataRequest(requestBody)

  // Make refresh token request
  let tokenResponse: TokenRespose
  try {
    tokenResponse = await ofetch(
      config.tokenUrl,
      {
        method: 'POST',
        headers,
        body: config.tokenRequestType === 'json' ? requestBody : requestForm,
      }
    )
  } catch (error: any) {
    logger.error(error.data) // Log ofetch error data to console
    throw new Error('Failed to refresh token')
  }

  // Construct tokens object
  const tokens: Record<'refreshToken' | 'accessToken', string> = {
    refreshToken: tokenResponse.refresh_token as string,
    accessToken: tokenResponse.access_token,
  }

  // Construct user object
  const user: UserSession = {
    canRefresh: !!tokenResponse.refresh_token,
    updatedAt: Math.trunc(Date.now() / 1000), // Use seconds instead of milliseconds to align wih JWT
  }

  // Update optional claims
  if (config.optionalClaims && tokenResponse.id_token) {
    const parsedIdToken = parseJwtToken(tokenResponse.id_token)
    user.claims = {}
    config.optionalClaims.forEach(claim => parsedIdToken[claim] && ((user.claims as Record<string, unknown>)[claim] = (parsedIdToken[claim])))
  }

  return {
    user,
    tokens,
    expiresIn: tokenResponse.expires_in,
  }
}

export function generateFormDataRequest(requestValues: RefreshTokenRequest | TokenRequest) {
  const requestBody = new FormData()
  Object.keys(requestValues).forEach((key) => {
    requestBody.append(key, normalizeURL(requestValues[(key as keyof typeof requestValues)] as string))
  })
  return requestBody
}

export function convertObjectToSnakeCase(object: Record<string, any>) {
  return Object.entries(object).reduce((acc, [key, value]) => {
    acc[snakeCase(key)] = value
    return acc
  }, {} as Record<string, any>)
}

export function oidcErrorHandler(event: H3Event, errorText: string, onError?: ((event: H3Event, error: H3Error) => void | Promise<void>), errorCode: number = 401) {
  const h3Error = createError({
    statusCode: errorCode,
    message: errorText,
  })
  if (!onError) throw h3Error
  return onError(event, h3Error)
}
