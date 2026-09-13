export type Category = 'principal' | 'spam' | 'promocoes' | 'redes_sociais';

export interface ClassificationDetail {
  category: Category;
  probability: number;
}

export interface ClassificationResult {
  category: Category;
  confidence: number;
  details: ClassificationDetail[];
  metadataSignals?: Record<string, number>;
}

export interface EmailAddress {
  name: string;
  address: string;
}

export interface InternetMessageHeader {
  name: string;
  value: string;
}

export interface AttachmentMetadata {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline?: boolean;
}

export interface MailMessage {
  id: string;
  subject: string;
  from?: { emailAddress?: EmailAddress };
  receivedDateTime: string;
  bodyPreview: string;
  body?: { content: string; contentType: 'html' | 'text' };
  isRead: boolean;
  hasAttachments: boolean;
  internetMessageHeaders?: InternetMessageHeader[];
  classification?: ClassificationResult;
}

export interface Feedback {
  messageId: string;
  text: string;
  label: number;
  labelName: Category;
  sender?: string;
  updatedAt: string;
}

export interface AuthSession {
  authenticated: boolean;
  account: string | null;
  userId?: string;
}

export interface MailFolder {
  id: string;
  displayName: string;
  parentFolderId?: string;
  totalItemCount?: number;
  unreadItemCount?: number;
}
