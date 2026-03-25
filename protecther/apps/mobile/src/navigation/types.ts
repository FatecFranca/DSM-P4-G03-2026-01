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
  };
};
