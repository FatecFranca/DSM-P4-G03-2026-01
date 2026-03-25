export type EmergencyInviteEmailPayload = {
  toEmail: string;
  ownerName: string;
  invitationToken: string;
  expiresAt: Date;
};

export interface EmergencyInviteEmailSender {
  sendEmergencyInvite(payload: EmergencyInviteEmailPayload): Promise<void>;
}
