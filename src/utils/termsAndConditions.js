/**
 * Terms & Conditions content for the platform.
 * Brand name is pulled from BRANDING — never hardcoded.
 */
import { BRANDING } from '../config.js'

const B = BRANDING.name

export const TERMS_LAST_UPDATED = "April 12, 2026"

/**
 * Each section may contain:
 *   title     — section heading
 *   paragraphs — array of paragraph strings (rendered before items)
 *   items      — array of bullet-point strings
 *   closing    — optional closing paragraph rendered after items
 */
export const TERMS_SECTIONS = [
  {
    id: "acceptance",
    title: "1. Acceptance of Terms",
    paragraphs: [
      `By creating an account, logging in, or otherwise accessing ${B} ("the Platform"), you confirm that you have read, understood, and agree to be bound by these Terms & Conditions in their entirety. If you do not agree with any provision of these Terms, you must immediately cease using the Platform and must not create an account.`,
      `These Terms constitute a legally binding agreement between you and the operators of ${B}. They apply to all users, including registered users, administrators, and guest visitors. Use of the Platform in any capacity constitutes acceptance of these Terms.`,
    ],
  },
  {
    id: "eligibility",
    title: "2. Eligibility and Registration",
    paragraphs: [
      `To register for an account on ${B}, you must meet all of the following requirements:`,
    ],
    items: [
      "You must be at least 13 years of age. Users under 18 must have parental or guardian consent.",
      "You must provide a valid, accurate email address and truthful registration information. Providing false information is a violation of these Terms.",
      "You must not currently have an account that has been permanently suspended or banned from the Platform.",
      `You acknowledge that ${B} reserves the right to verify your identity and reject any registration at its sole discretion, with or without explanation.`,
      "Each person may maintain only one active account unless explicitly authorized in writing by a platform administrator.",
      "Usernames must not impersonate real persons, organisations, public figures, or the Platform itself.",
    ],
  },
  {
    id: "account-security",
    title: "3. Account Security and Responsibility",
    paragraphs: [
      "You are solely and wholly responsible for all activity that occurs under your account, whether or not you personally authorised it.",
    ],
    items: [
      "You must create a strong, unique password and must not share your login credentials with any third party under any circumstances.",
      "You must notify administrators immediately if you suspect unauthorised access to your account, credential compromise, or any suspicious activity.",
      `${B} will never ask you for your password via email, chat, or any other channel. Any communication requesting your password should be treated as a phishing attempt and reported immediately.`,
      "You must not use automated tools, bots, scripts, or macros to access, interact with, or extract data from the Platform without explicit prior written authorisation.",
      "You are responsible for logging out of your account on shared, public, or untrusted devices.",
      "You must not allow minors to access your account without adequate supervision.",
    ],
  },
  {
    id: "acceptable-use",
    title: "4. Acceptable Use Policy",
    paragraphs: [
      `You agree to use ${B} only for lawful, ethical, and constructive purposes. The Platform is intended for personal productivity, file management, creative work, and legitimate collaboration.`,
      `Any use of the Platform that harms, disrupts, exploits, or endangers ${B}, its infrastructure, its operators, or its users is expressly prohibited. Violation of this policy may result in immediate suspension or permanent termination of your account.`,
    ],
  },
  {
    id: "prohibited",
    title: "5. Prohibited Activities",
    paragraphs: [
      `The following activities are strictly prohibited. Engaging in any of these activities will result in an immediate investigation and is likely to result in temporary suspension, permanent termination, and/or referral to relevant law enforcement authorities:`,
    ],
    items: [
      `Unauthorised Access: Attempting to access, probe, port-scan, fingerprint, or test the security of ${B}'s systems, servers, databases, APIs, or network infrastructure without explicit written authorisation from an administrator.`,
      `Hacking: Using any hacking tools, exploit frameworks, shellcode, rootkits, privilege escalation techniques, or any other offensive security method against the Platform, its servers, or its users.`,
      `Bug Exploitation: Deliberately discovering and exploiting bugs, glitches, race conditions, logical flaws, or misconfigured access controls in ${B} to gain unauthorised access, bypass restrictions, elevate privileges, tamper with data, or disrupt service. Discovery of a bug must be reported responsibly and not exploited in any manner.`,
      `Brute-Force Attacks: Attempting to guess, crack, enumerate, or systematically test passwords, PINs, API keys, authentication tokens, or other credentials through automated or manual methods.`,
      `Injection Attacks: Submitting SQL, NoSQL, OS command, LDAP, XPath, XML, template, or any other form of malicious injection payload through any input field, URL parameter, header, or API call with intent to manipulate the database, server, or application logic.`,
      `Cross-Site Scripting (XSS): Injecting malicious scripts or HTML into pages, inputs, or stored content with the intent of executing those scripts in other users' browsers or hijacking their sessions.`,
      `Cross-Site Request Forgery (CSRF): Crafting, distributing, or facilitating requests designed to trick authenticated users into performing unintended or harmful actions on the Platform.`,
      `Session Hijacking and Token Theft: Attempting to steal, intercept, clone, forge, or replay authentication tokens, session cookies, JWT tokens, OAuth codes, or other credentials.`,
      `Man-in-the-Middle (MitM): Intercepting or tampering with communications between users and the Platform, or between Platform services.`,
      `Data Scraping and Harvesting: Using automated means — including bots, crawlers, or scripts — to harvest, extract, copy, or systematically download user data, file listings, or any content from the Platform without written permission.`,
      `Reverse Engineering: Attempting to decompile, disassemble, decode, unminify, or otherwise derive the source code, algorithms, cryptographic keys, or internal structure of the Platform through any means.`,
      `Denial of Service (DoS/DDoS): Flooding the Platform with traffic, requests, connections, or data with intent to degrade performance, exhaust resources, or render the service unavailable to other users.`,
      `Spam and Resource Flooding: Repeatedly and rapidly submitting forms, uploading large volumes of data, creating files, or making API calls in a manner that places undue strain on system resources or impairs the experience of other users.`,
      `Impersonation: Pretending to be another registered user, an administrator, a member of the ${B} operations team, a customer support representative, or any real-world person or organisation.`,
      `Malware and Malicious File Distribution: Uploading, distributing, storing, or linking to malicious files including but not limited to viruses, trojans, ransomware, spyware, adware, worms, keyloggers, or any software designed to cause harm.`,
      `Bypassing Access Controls: Attempting to access features, services, API endpoints, files, or data that you are not authorised to access, regardless of the technical method employed.`,
      `Account Evasion: Registering new accounts — whether under your real identity or under false information — with the intent to circumvent an existing suspension, ban, or restriction applied to a previous account.`,
      `Social Engineering: Attempting to manipulate users, staff, or administrators into revealing sensitive information, granting unauthorised access, or taking actions that benefit you at the expense of security.`,
      `Harassment and Abuse: Using the Platform to harass, stalk, threaten, intimidate, bully, doxx, or otherwise harm other users or members of the ${B} team.`,
      `Illegal Activity: Using the Platform for any purpose that violates applicable local, national, or international laws or regulations, including but not limited to copyright infringement, fraud, money laundering, terrorism-related activities, or the distribution of illegal content.`,
      `Privacy Violations: Knowingly collecting, storing, sharing, or publishing personal data of other users without their explicit consent.`,
      `Cryptocurrency Mining: Running cryptocurrency miners, proof-of-work computations, or similar resource-intensive background processes on Platform infrastructure.`,
    ],
  },
  {
    id: "suspension",
    title: "6. Account Suspension and Termination",
    paragraphs: [
      `${B} reserves the right to take any of the following enforcement actions at its sole and absolute discretion, with or without prior notice, depending on the severity and nature of the violation:`,
    ],
    items: [
      `Temporary Suspension: Applied for first-time, minor, or borderline violations. Duration ranges from 24 hours to 30 calendar days, as determined by the nature and severity of the breach. During suspension the account and all associated data remain inaccessible.`,
      `Extended Suspension: Applied for repeated or moderately serious violations after a temporary suspension has already been served. Duration may extend to 90 days or more.`,
      `Permanent Ban: Applied to accounts involved in hacking, systematic exploitation of vulnerabilities, repeated policy violations, criminal activity, threats, or any action that poses a serious and ongoing risk to the Platform, its data, or its users. Permanent bans are final and irrevocable.`,
      `Immediate Termination Without Notice: In cases where the Platform's security, data integrity, or other users are at immediate risk, accounts may be terminated instantly without any prior warning or opportunity to respond.`,
      `Investigation Hold: Accounts may be temporarily suspended while an investigation into suspected violations is ongoing. The suspension will be lifted or made permanent based on the investigation outcome.`,
      `Data Preservation: Evidence related to violations — including access logs, file activity records, session history, and IP addresses — may be preserved indefinitely for legal, audit, regulatory compliance, or law enforcement purposes.`,
      `No Compensation: Suspended or terminated accounts are not entitled to any compensation, credit, refund, or restoration of data. All content associated with terminated accounts may be permanently deleted.`,
      `Post-Reinstatement Conduct: Reinstatement of a suspended account, if granted, is at the sole discretion of administrators. Any subsequent violation following reinstatement will result in immediate and permanent termination with no further right of appeal.`,
      `Legal Action: ${B} reserves the right to pursue civil or criminal legal action for violations that constitute unlawful conduct, including but not limited to unauthorised computer access, data theft, harassment, and fraud.`,
    ],
  },
  {
    id: "vulnerability-disclosure",
    title: "7. Responsible Security Disclosure",
    paragraphs: [
      `${B} takes security seriously and values the efforts of security researchers and users who responsibly report vulnerabilities. If you discover a security vulnerability, bug, misconfiguration, or unintended behaviour, you are required to follow responsible disclosure practices:`,
    ],
    items: [
      `Report the vulnerability promptly and privately to the ${B} platform administrators through official channels before disclosing it to any third party, publishing details online, or sharing it in any public forum.`,
      "Provide sufficient technical detail to allow the team to reproduce, understand, and address the issue — without weaponising, weaponising the proof-of-concept, or publicly demonstrating the exploit.",
      "Refrain from accessing, copying, downloading, modifying, deleting, or exfiltrating any data beyond the absolute minimum necessary to confirm the existence of the vulnerability.",
      "Immediately cease any activity that triggers the vulnerability upon confirming its existence. Continued or intentional exploitation — even if discovered accidentally — will be treated as a deliberate attack.",
      `Allow ${B} a reasonable time period to investigate, develop a patch, and deploy a fix before any public or coordinated disclosure. The standard industry embargo period of 90 days is observed.`,
      "Do not attempt to access or affect accounts, systems, or data belonging to other users as part of your security research.",
    ],
    closing: `Responsible disclosure is valued, appreciated, and may be recognised with a public acknowledgement in platform release notes. However, exploitation of any discovered vulnerability — regardless of claimed intent — constitutes a severe breach of these Terms and will result in immediate permanent account termination, data preservation, and potential referral to law enforcement.`,
  },
  {
    id: "intellectual-property",
    title: "8. Intellectual Property",
    paragraphs: [
      `All software, source code, interfaces, designs, logos, trademarks, service marks, trade names, and written materials on ${B} are the intellectual property of their respective owners and are protected by applicable copyright, trademark, patent, and other intellectual property laws.`,
      `User-generated content — including files, notes, and documents you create or upload — remains your property. By storing content on the Platform, you grant ${B} a limited, non-exclusive, royalty-free, worldwide licence to store, cache, transmit, and display that content solely for the purpose of providing the service to you. This licence terminates upon deletion of the content or closure of your account.`,
    ],
    items: [
      `You may not copy, reproduce, modify, distribute, publicly perform, publicly display, republish, or create derivative works from any ${B}-owned content without prior written authorisation.`,
      "You must not remove, alter, or obscure any copyright notices, trademark identifiers, watermarks, or proprietary notices on any Platform content.",
      "You confirm that any content you upload does not infringe the intellectual property rights of any third party.",
    ],
  },
  {
    id: "privacy",
    title: "9. Privacy and Data Collection",
    paragraphs: [
      `By using ${B}, you consent to the collection, storage, and processing of your personal data as described in this section and any applicable Privacy Policy. ${B} is committed to handling personal data responsibly and transparently.`,
    ],
    items: [
      "We collect only the data strictly necessary to operate and improve the service: including your username, email address, hashed password, upload history, usage statistics, and IP address logs.",
      "We do not sell, rent, transfer, or share your personal data with third parties for advertising, marketing, or commercial profiling purposes.",
      "Your data is stored securely using industry-standard encryption and authentication practices. Access is restricted to authorised personnel on a need-to-know basis.",
      "We may retain certain data following account deletion for legal compliance, audit trails, and fraud prevention for a period of up to 90 calendar days, after which it is permanently purged.",
      "You have the right to request a copy of your personal data or to request its deletion through the account settings. Deletion requests for data subject to active legal holds may be deferred.",
      "We use session cookies and authentication tokens solely for the purpose of maintaining your login session and ensuring the security of your account. We do not use cookies for cross-site tracking or advertising.",
      "Data processed by AI features within the Platform may be temporarily retained by third-party AI providers in accordance with their own data retention policies.",
    ],
  },
  {
    id: "ai-services",
    title: "10. AI-Powered Services",
    paragraphs: [
      `${B} may provide access to AI-powered features subject to usage quotas, rate limits, and the following additional conditions:`,
    ],
    items: [
      "AI features must not be used to generate illegal, harmful, hateful, discriminatory, violent, sexually explicit, defamatory, or deliberately deceptive content.",
      "You must not use AI features to produce content designed to facilitate hacking, malware creation, social engineering, or any activity prohibited under these Terms.",
      `AI-generated content is produced by automated systems and does not represent the views, opinions, endorsements, or professional advice of ${B} or its operators. You should not rely on AI outputs for critical medical, legal, financial, or safety decisions.`,
      "Attempts to circumvent, reset, manipulate, or abuse AI usage quotas or rate limits through any technical or social means are expressly prohibited.",
      "Prompt injection attacks — crafting inputs designed to manipulate the AI system's instructions or cause unintended behaviour — are prohibited.",
      `${B} is not liable for the accuracy, completeness, legality, or consequences of any AI-generated output. You are solely responsible for how you use or distribute AI-generated content.`,
      "AI usage may be monitored for abuse detection, safety, and platform security purposes.",
    ],
  },
  {
    id: "data-integrity",
    title: "11. Data Integrity and Service Availability",
    paragraphs: [
      `${B} makes commercially reasonable efforts to maintain data integrity, security, and service availability, but cannot guarantee uninterrupted, error-free, or permanent availability of the Platform or your stored data.`,
    ],
    items: [
      "You are strongly encouraged to maintain local backups of all important files and data stored on the Platform. Reliance on the Platform as your sole backup solution is done at your own risk.",
      `${B} shall not be held liable for data loss caused by server hardware failure, software bugs, cyberattacks, acts of nature, third-party service outages, or any other unforeseen or force majeure events.`,
      `${B} reserves the right to modify, suspend, restrict, or permanently discontinue any feature, service, or the entire Platform at any time, with or without prior notice, for any reason including but not limited to technical maintenance, legal requirements, or business decisions.`,
      "Planned maintenance windows that result in temporary service unavailability will be communicated to users with reasonable advance notice where possible.",
      "Service Level Agreements (SLAs) are not implied or guaranteed unless agreed upon separately in writing.",
    ],
  },
  {
    id: "third-party",
    title: "12. Third-Party Integrations and External Services",
    paragraphs: [
      `${B} may integrate with, link to, or rely upon third-party services, APIs, libraries, or platforms. The following applies to all such third-party components:`,
    ],
    items: [
      `${B} is not responsible for the availability, reliability, privacy practices, security posture, or content of any third-party service or integration.`,
      "Use of any third-party service accessed through or in connection with the Platform is governed by that party's own terms and conditions and privacy policies, which you should review independently.",
      `${B} does not endorse, warrant, or assume any liability for third-party content, products, or services.`,
      "Third-party integrations may be modified, restricted, or discontinued at any time without notice if the third-party provider changes their terms, APIs, or availability.",
    ],
  },
  {
    id: "disclaimer",
    title: "13. Disclaimer of Warranties",
    paragraphs: [
      `${B} is provided on an "as is" and "as available" basis. To the fullest extent permitted by applicable law, ${B} and its operators expressly disclaim all warranties of any kind, whether express, implied, statutory, or otherwise, including but not limited to:`,
    ],
    items: [
      "Implied warranties of merchantability, fitness for a particular purpose, and non-infringement.",
      "Any warranty that the Platform will meet your requirements, be available without interruption, or be free from errors, defects, or security vulnerabilities.",
      "Any warranty regarding the accuracy, completeness, timeliness, or reliability of any content, information, or data on the Platform.",
      "Any warranty that the Platform is free from viruses, malicious code, or other harmful components.",
    ],
    closing: `You use the Platform entirely at your own risk. Some jurisdictions do not allow the exclusion of implied warranties; in such jurisdictions the above exclusions apply to the maximum extent permitted by law.`,
  },
  {
    id: "liability",
    title: "14. Limitation of Liability",
    paragraphs: [
      `To the fullest extent permitted by applicable law, ${B} and its operators, directors, employees, agents, licensors, and service providers shall not be liable for any:`,
    ],
    items: [
      "Indirect, incidental, special, consequential, exemplary, or punitive damages of any kind.",
      "Loss of data, files, content, revenue, profits, goodwill, business opportunities, or anticipated savings.",
      "Damages resulting from unauthorised access to or alteration of your account or data.",
      "Damages arising from your use of, or inability to use, the Platform or any feature thereof.",
      "Damages caused by any third-party conduct, service, or content accessed through the Platform.",
    ],
    closing: `This limitation of liability applies regardless of the legal theory under which damages are sought (contract, tort, negligence, strict liability, or otherwise) and even if ${B} has been advised of the possibility of such damages. The aggregate total liability of ${B} for any claim under these Terms shall not exceed the greater of the amount you paid to use the Platform in the 12 months preceding the claim, or $10 USD.`,
  },
  {
    id: "indemnification",
    title: "15. Indemnification",
    paragraphs: [
      `You agree to indemnify, defend, and hold harmless ${B} and its operators, directors, employees, contractors, agents, licensors, and affiliates from and against any and all claims, demands, liabilities, damages, losses, costs, and expenses — including reasonable legal and attorneys' fees — arising out of or in connection with:`,
    ],
    items: [
      "Your use of or access to the Platform.",
      "Your violation of any of these Terms & Conditions.",
      "Your violation of any applicable law, regulation, or third-party right (including intellectual property rights, privacy rights, or consumer protection laws).",
      "Any content you upload, transmit, store, or otherwise make available through the Platform.",
      "Any harm caused by you to another user, administrator, or third party through your use of the Platform.",
    ],
  },
  {
    id: "governing-law",
    title: "16. Governing Law and Dispute Resolution",
    paragraphs: [
      "These Terms shall be governed by and construed in accordance with applicable law. Any dispute, controversy, or claim arising out of or in connection with these Terms, or the breach, termination, or validity thereof, shall be subject to the exclusive jurisdiction of the competent courts in the applicable jurisdiction.",
      `We encourage resolution of disputes through direct and good-faith communication with ${B} administrators before pursuing any formal legal or arbitral proceedings.`,
    ],
  },
  {
    id: "changes",
    title: "17. Changes to These Terms",
    paragraphs: [
      `${B} reserves the right to modify, update, or replace these Terms & Conditions at any time and at its sole discretion. When changes are made, the "Last Updated" date at the top of this document will be revised to reflect the date of the most recent update.`,
      `Your continued use of the Platform following the posting of any updated Terms constitutes your binding acceptance of those changes. It is your sole responsibility to review these Terms periodically. If you do not agree to the modified Terms, you must stop using the Platform and may request deletion of your account through the account settings.`,
      "For significant or material changes that substantially affect your rights, we will make reasonable efforts to notify users through in-platform notifications or other appropriate means.",
    ],
  },
  {
    id: "contact",
    title: "18. Contact and Reporting",
    paragraphs: [
      `If you have questions, concerns, or feedback about these Terms, wish to report a security vulnerability, or need to report a policy violation by another user, please contact the ${B} platform administrators through the officially supported in-platform channels, the administrator contact email, or through the Settings panel.`,
      "We take all reports seriously. Security vulnerability reports will receive a timely response and will be handled with confidentiality. Policy violation reports will be investigated thoroughly and impartially.",
      `Thank you for taking the time to read these Terms. By using ${B}, you join a community built on trust, respect, and shared responsibility. We are committed to maintaining a safe and productive environment for all users.`,
    ],
  },
]
