# ⚠️ Buzzvil fork of goauthentik/authentik

이 저장소는 **upstream [goauthentik/authentik](https://github.com/goauthentik/authentik) 의 포크**이며,
AWS WorkSpaces SAML SSO 를 위한 **2 파일 패치**만 얹은 것이다. 그 외 코드는 upstream 과 동일하다.

빌드 이미지: **`ghcr.io/buzzvil/authentik:2026.2.1-relaystate`** (multi-arch amd64/arm64, public)
소비처: `Buzzvil/buzz-k8s-resources` → `argo-cd/buzzvil-eks-ops/apps/authentik.yaml` 의 `global.image` override
(ops 클러스터 `ops-k8s-authentik`). base: `ghcr.io/goauthentik/server:2026.2.1`.

## 무슨 패치인가

**IdP-initiated SAML 로그인이 SP 가 넘긴 `RelayState` 를 그대로 forward** 하도록 수정.

| 파일 | 변경 |
|------|------|
| `authentik/providers/saml/views/sso.py` | `SAMLSSOBindingInitView` 가 `request.GET["RelayState"]` 를 `idp_initiated()` 로 전달 |
| `authentik/providers/saml/processors/authn_request_parser.py` | `idp_initiated(relay_state=None)` — 전달된 relay_state 를 provider 의 정적 `default_relay_state` 보다 우선 사용 |

### 왜 필요한가
AWS WorkSpaces native client 로그인은 euc-sso 가 IdP init URL 에 **per-session state code 를
`?RelayState=` 로 붙여** 보내고, IdP 가 그 값을 SAML Response 에 echo 해야 euc-sso 가 auth code 를
그 client 세션에 바인딩한다. **upstream Authentik 의 IdP-initiated init 엔드포인트는 요청의 `RelayState`
쿼리를 무시하고 provider 의 정적 `default_relay_state` 만** 쓰기 때문에(SP-initiated redirect/POST
뷰와 달리), state code 가 유실되어 native client 가 sign-in 으로 loop-back 한다.
(upstream 동일 이슈: goauthentik/authentik#17542)

## 빌드 / 릴리스

`.buzzvil/Dockerfile` 이 공식 이미지 위에 위 2 파일만 COPY 하는 overlay 이고, 빌드 워크플로우
(`build-patched-ghcr`)가 **`<ver>-relaystate` 태그 push** 시 GitHub-hosted 러너에서 multi-arch(amd64/arm64)
빌드해 GHCR 로 push 하고 **동일 태그로 GitHub Release 를 함께 생성**한다.
(별도 self-hosted 러너·AWS·org secret 불필요. 이미지만 재빌드하려면 workflow_dispatch.)

## 언제 내릴 수 있나 (이 포크 제거 조건)

이 포크는 **임시**이며, 아래 중 하나가 충족되면 제거하고 공식 이미지로 되돌린다.

1. **(우선) upstream 이 고칠 때** — goauthentik/authentik 가 IdP-initiated init 뷰에서 요청 `RelayState`
   를 forward 하도록 반영한 릴리스가 나오면(이슈 #17542 에 upstream PR 기여 권장), ops 의 `global.image`
   override 를 제거해 `ghcr.io/goauthentik/server` 정식 이미지로 복귀하고 이 포크를 archive.
2. **WorkSpaces SAML 경로가 사라질 때** — adfit VDI 폐기 또는 인증 방식 변경 시.

**제거 전 검증**: 대상 버전으로 올린 뒤 WorkSpaces native client 로그인을 end-to-end(auth code 발급 →
데스크톱 연결)로 확인하고 나서 포크를 내린다.

## 유지보수 (upstream 이 고치기 전까지)

authentik 을 새 버전으로 올릴 때마다 이 2 파일 패치를 새 버전 기준으로 다시 적용한다:
1. upstream 태그(`version/<X.Y.Z>`)에서 브랜치 `buzzvil/workspaces-relaystate-<X.Y.Z>` 생성
2. 위 2 파일 패치 재적용(작고 self-contained), `.buzzvil/Dockerfile` 의 `FROM ...:<X.Y.Z>` 갱신
3. 그 커밋에 태그 **`<X.Y.Z>-relaystate`** push → 워크플로우가 멀티아치 이미지 빌드 + 동일 태그 Release 생성
4. ops(buzz-k8s-resources) 의 `global.image` tag 를 `<X.Y.Z>-relaystate` 로 갱신 → WorkSpaces 로그인 재검증

---

> 아래는 upstream authentik README 원문.

<p align="center">
    <img src="https://goauthentik.io/img/icon_top_brand_colour.svg" height="150" alt="authentik logo">
</p>

---

[![Join Discord](https://img.shields.io/discord/809154715984199690?label=Discord&style=for-the-badge)](https://goauthentik.io/discord)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/goauthentik/authentik/ci-main.yml?branch=main&label=core%20build&style=for-the-badge)](https://github.com/goauthentik/authentik/actions/workflows/ci-main.yml)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/goauthentik/authentik/ci-outpost.yml?branch=main&label=outpost%20build&style=for-the-badge)](https://github.com/goauthentik/authentik/actions/workflows/ci-outpost.yml)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/goauthentik/authentik/ci-web.yml?branch=main&label=web%20build&style=for-the-badge)](https://github.com/goauthentik/authentik/actions/workflows/ci-web.yml)
[![Code Coverage](https://img.shields.io/codecov/c/gh/goauthentik/authentik?style=for-the-badge)](https://codecov.io/gh/goauthentik/authentik)
![Latest version](https://img.shields.io/docker/v/authentik/server?sort=semver&style=for-the-badge)
[![](https://img.shields.io/badge/Help%20translate-transifex-blue?style=for-the-badge)](https://explore.transifex.com/authentik/authentik/)

## What is authentik?

authentik is an open-source Identity Provider (IdP) for modern SSO. It supports SAML, OAuth2/OIDC, LDAP, RADIUS, and more, designed for self-hosting from small labs to large production clusters.

Our [enterprise offering](https://goauthentik.io/pricing) is available for organizations to securely replace existing IdPs such as Okta, Auth0, Entra ID, and Ping Identity for robust, large-scale identity management.

## Installation

- Docker Compose: recommended for small/test setups. See the [documentation](https://docs.goauthentik.io/docs/install-config/install/docker-compose/).
- Kubernetes (Helm Chart): recommended for larger setups. See the [documentation](https://docs.goauthentik.io/docs/install-config/install/kubernetes/) and the Helm chart [repository](https://github.com/goauthentik/helm).
- AWS CloudFormation: deploy on AWS using our official templates. See the [documentation](https://docs.goauthentik.io/docs/install-config/install/aws/).
- DigitalOcean Marketplace: one-click deployment via the official Marketplace app. See the [app listing](https://marketplace.digitalocean.com/apps/authentik).

## Screenshots

| Light                                                       | Dark                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| ![](https://docs.goauthentik.io/img/screen_apps_light.jpg)  | ![](https://docs.goauthentik.io/img/screen_apps_dark.jpg)  |
| ![](https://docs.goauthentik.io/img/screen_admin_light.jpg) | ![](https://docs.goauthentik.io/img/screen_admin_dark.jpg) |

## Development and contributions

See the [Developer Documentation](https://docs.goauthentik.io/docs/developer-docs/) for information about setting up local build environments, testing your contributions, and our contribution process.

## Security

Please see [SECURITY.md](SECURITY.md).

## Adoption

Using authentik? We'd love to hear your story and feature your logo. Email us at [hello@goauthentik.io](mailto:hello@goauthentik.io) or open a GitHub Issue/PR!

## License

[![MIT License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![CC BY-SA 4.0](https://img.shields.io/badge/License-CC%20BY--SA%204.0-lightgrey?style=for-the-badge)](website/LICENSE)
[![authentik EE License](https://img.shields.io/badge/License-EE-orange?style=for-the-badge)](authentik/enterprise/LICENSE)
