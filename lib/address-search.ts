export type AddressSuggestion = {
  id: string;
  label: string;
  addressLine1: string;
  city: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
};
