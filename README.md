# redshellmartell.com

Static rebuild of www.redshellmartell.com (moving off Wix).

## Build

    node build.mjs

Output goes to `dist/`. No dependencies.

- `site.config.json` holds the name, email, menu, social links and the contact form key.
- `src/layout.html` is the shared header, menu and footer.
- `src/pages/` has one file per page. `src/blog/` has one file per blog post.
- `assets/` is copied as-is (CSS, JS, images).

## Hosting (Cloudflare Pages)

- Build command: `node build.mjs`
- Build output directory: `dist`

## Contact form

The form posts to [Web3Forms](https://web3forms.com). Get a free access key there
with the email that should receive messages, and put it in `site.config.json` as `formKey`.
