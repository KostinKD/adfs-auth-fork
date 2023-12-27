import { ofetch } from 'ofetch'
import { defineOidcProvider } from './provider'
import { parseURL } from 'ufo'
import type { OidcProviderConfig } from '../types/oidc'

type EntraIdRequiredFields = 'clientId' | 'clientSecret' | 'authorizationUrl' | 'tokenUrl' | 'redirectUri'

export const entra = defineOidcProvider<OidcProviderConfig, EntraIdRequiredFields>({
  tokenRequestType: 'form',
  responseType: 'code',
  authenticationScheme: 'header',
  logoutRedirectParameterName: 'post_logout_redirect_uri',
  grantType: 'authorization_code',
  scope: ['openid'],
  pkce: true,
  state: true,
  nonce: false,
  scopeInTokenRequest: false,
  requiredProperties: [
    'clientId',
    'clientSecret',
    'authorizationUrl',
    'tokenUrl',
    'redirectUri',
  ],
  async openIdConfiguration(config: any) {
    const tenantId = parseURL(config.authorizationUrl).pathname.split('/')[1]
    const openIdConfig = await ofetch(`https://login.microsoftonline.com/${tenantId}/.well-known/openid-configuration`)
    openIdConfig.issuer = [`https://login.microsoftonline.com/${tenantId}/v2.0`, openIdConfig.issuer]
    return openIdConfig
  },
  validateAccessToken: false,
  validateIdToken: true,
})
