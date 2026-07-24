# Security Policy

## Supported Versions

notectl is maintained as an open-source project on a best-effort basis.

Security fixes are provided for the latest published release only. Older
versions generally do not receive backported security fixes.

| Version                     | Supported |
| --------------------------- | --------- |
| Latest published release    | ✅         |
| Older releases              | ❌         |
| Unreleased development code | ❌         |

Users are encouraged to update to the latest available versions of
`@notectl/core` and `@notectl/angular`.

## Reporting a Vulnerability

Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.

Instead, use GitHub's private vulnerability reporting feature:

1. Open the **Security** tab of this repository.
2. Select **Advisories**.
3. Click **Report a vulnerability**.

Please include as much of the following information as possible:

* The affected package and version
* A description of the vulnerability and its potential impact
* Steps to reproduce the issue
* A minimal proof of concept, if available
* Relevant browser, framework, or runtime versions
* Any known workarounds or suggested mitigations

Examples of relevant security issues include:

* Cross-site scripting or unsafe HTML handling
* Sanitization or URL-validation bypasses
* Code execution caused by crafted editor content
* Denial-of-service issues caused by specially crafted input
* Vulnerabilities affecting the integrity of the published npm packages

General bugs, feature requests, and accessibility issues that do not have a
security impact should be reported through the normal GitHub issue tracker.

## What to Expect

I will try to acknowledge a vulnerability report within seven days. This is a
best-effort target and not a guaranteed service-level agreement.

After reviewing the report:

* Confirmed vulnerabilities will be handled privately while a fix is prepared.
* Additional information may be requested to reproduce or assess the issue.
* Disclosure and release timing will be coordinated with the reporter where
  practical.
* If the report is not considered a security vulnerability, an explanation
  will be provided and the issue may be redirected to the public issue tracker.

Please avoid publicly disclosing the vulnerability until a fix or security
advisory has been published.
