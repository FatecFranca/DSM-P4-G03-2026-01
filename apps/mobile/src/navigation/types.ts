export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type AppStackParamList = {
  Home: undefined;
  Contacts: undefined;
  Sos: undefined;
  ActiveAlert: { alertId: string };
  ContactAlertsFeed: undefined;
  ContactAlertDetail: {
    alertId: string;
    ownerName: string;
    startedAt: string;
    /** Preenchido quando o alerta já foi encerrado (aberto pelo histórico). */
    endedAt?: string | null;
    /** A usuária é a titular do alerta (vê como registro, sem confirmar). */
    isOwner?: boolean;
  };
  DeviceManagement: undefined;
  Appearance: { hide?: boolean } | undefined;
  QuickSos: undefined;
};
