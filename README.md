# Exceptionally Floral

Responsive static website for custom decorative/artificial floral arrangements and décor. No build step or third-party scripts. Original supplied photos appear only within the labeled Halloween collection; the original logo was retrieved from the business Facebook page with Randy’s authorization.

## GitHub Pages

Publish this folder's contents at the repository root. In Settings → Pages choose Deploy from a branch, main, / (root), and Save. All asset URLs are relative so both a project URL and custom domain work. The .nojekyll file disables Jekyll processing.

## Custom domain: exceptionallyfloral.com

Keep the GitHub Pages URL until domain ownership and DNS access are confirmed. Verify ownership in GitHub account Settings → Pages first, then set exceptionallyfloral.com in the repository's Pages settings. GitHub will create CNAME for branch publishing. Configure the registrar using GitHub's current instructions, including www pointing to randypoffinberger-design.github.io. Enable Enforce HTTPS when the certificate is ready. Do not add CNAME prematurely: it would redirect the working preview before the domain is connected.

Official instructions: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site

## Editing

- Content, Facebook quote link, captions, and image alt text: index.html.
- Colors, layout, and responsive rules: styles.css.
- Mobile navigation and accessible image viewer: script.js.
- Supplied product photos: assets/. Preserve attribution/embedded marks.
- Contact currently goes to the user-provided Facebook page. There is no form submission or email address until a real destination is confirmed.
- Add non-Halloween photos, owner biography, and service area when supplied. Do not invent details, prices, or availability.

When transferring the repository to the business owner, recheck Pages publishing, DNS, and HTTPS under the new account.

## Review preview

The preview has a noindex, nofollow meta tag to discourage search indexing. It is public, not private. Remove that tag when the owner approves the official launch. Both business domains remain unchanged.
