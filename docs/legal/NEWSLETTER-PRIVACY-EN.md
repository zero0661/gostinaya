# Newsletter data processing policy

Candidate for publication after domain cutover and cleanup activation.

Версия / Version: newsletter-2026-10-07-v1

## Controller and scope

Peter Vladimirovich Milenin, an individual and author of After Login, milenin.pro. Data enquiries: milen.petr@gmail.com. This policy covers the essay newsletter. Registering in the Lounge is a separate process.

## Purpose and basis

Voluntary subscription, address confirmation, delivery of new essays in the selected language, unsubscription and prevention of duplicate deliveries. Subscription processing is based on separate consent. Reading the website does not require a subscription.

## Data

Email address and language; Ghost subscription status; consent version, identifier and server timestamps for acceptance, confirmation and withdrawal; temporary request information and hashed tokens; delivery and error records. The consent journal does not collect IP addresses, passport details, phone numbers or subscriber names. Separately, the web server processes connection information, including the IP address and requested path.

## How it works

The required consent checkbox is not checked in advance. The server checks consent and the document version, then records acceptance before contacting the newsletter service. New addresses receive essays only after email confirmation. Visiting an unsubscribe link alone does not cancel the subscription: a confirmation button is provided.

## Location and provider

Operational Ghost and Lounge databases, the consent journal and new backups are hosted in Yandex Cloud's Russian ru-central1 region. Yandex.Cloud LLC provides hosting, Cloud Backup and Postbox email delivery. The provider receives data necessary for hosting, backup and delivery. Delivered email is processed by the recipient's email provider under its own terms. Enquiries sent to the controller's Gmail address are also processed by Google; please do not include passport details or other unnecessary information.

## Migration from the previous host

The project is being moved from its previous host. Earlier copies may remain on the previous server and the controller's device until migration checks and deletion are completed. Access is restricted to the controller; these copies are not used as a new newsletter database. Moving the operational database does not itself delete all previous copies.

## Retention and stopping processing

A subscription is used until unsubscription or withdrawal. Confirmation links last 24 hours; unconfirmed consent records are removed after seven days by a daily cleanup task. Confirmed consents are retained while the subscription is active. Following withdrawal, limited records may remain while deletion is being fulfilled. Processing stops and data is destroyed within applicable statutory periods unless another lawful basis applies. Unsubscription stops essays but does not automatically delete every Ghost record, log or backup.

## Backups

Cloud Backup retains the latest 15 copies. This is a number of copies, not a guarantee of deletion after 15 calendar days. Backup data is used for recovery. Previously fulfilled deletion and unsubscription requests must be respected during recovery; cancelled subscriptions must not be resumed by restoring a backup.

## Rights and enquiries

You may request information about processing, correction of your email or language, withdrawal of consent or data deletion. Email milen.petr@gmail.com from your subscription address. The controller may ask for information needed to verify control of that address. Responses and fulfilment follow applicable statutory periods.

## Security

HTTPS transmission, restricted administrative access, separate email-service credentials, hashed confirmation tokens and backups. The project does not claim information-system certification. Existing subscribers are not retroactively recorded as having accepted the new consent version.

## Changes

Each published consent version is preserved with the code and linked to journal entries. Changes to the purposes or scope of processing require an assessment of whether new consent is needed.
