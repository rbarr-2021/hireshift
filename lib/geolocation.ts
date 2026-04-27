type ReverseGeocodeAddress = {
  road?: string;
  house_number?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  postcode?: string;
  suburb?: string;
  neighbourhood?: string;
};

type ReverseGeocodeResponse = {
  address?: ReverseGeocodeAddress;
};

export type GeolocationAddress = {
  addressLine1: string;
  city: string;
  postcode: string;
  accuracyMeters: number;
};

export type GeolocationCoordinates = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

function buildAddressLine1(address: ReverseGeocodeAddress | undefined) {
  if (!address) {
    return "";
  }

  const line = [address.house_number, address.road].filter(Boolean).join(" ").trim();

  if (line) {
    return line;
  }

  return [address.suburb, address.neighbourhood].filter(Boolean).join(", ").trim();
}

function buildCity(address: ReverseGeocodeAddress | undefined) {
  if (!address) {
    return "";
  }

  return (
    address.city ||
    address.town ||
    address.village ||
    address.hamlet ||
    ""
  );
}

export async function getAddressFromCurrentLocation(): Promise<GeolocationAddress> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    throw new Error("Geolocation is only available in the browser.");
  }

  if (!navigator.geolocation) {
    throw new Error("This browser does not support geolocation.");
  }

  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    });
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${position.coords.latitude}&lon=${position.coords.longitude}`,
    {
      headers: {
        "Accept-Language": "en-GB,en;q=0.9",
      },
    },
  );

  if (!response.ok) {
    throw new Error("We could not look up your address from your location.");
  }

  const payload = (await response.json()) as ReverseGeocodeResponse;
  const address = payload.address;
  const city = buildCity(address);
  const postcode = address?.postcode ?? "";
  const addressLine1 = buildAddressLine1(address);

  if (!city && !postcode && !addressLine1) {
    throw new Error("We found your location, but could not turn it into an address.");
  }

  return {
    addressLine1,
    city,
    postcode,
    accuracyMeters: position.coords.accuracy,
  };
}

export async function getCurrentCoordinates(): Promise<GeolocationCoordinates | null> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return null;
  }

  if (!navigator.geolocation) {
    return null;
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 7000,
        maximumAge: 60000,
      });
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: position.coords.accuracy,
    };
  } catch {
    return null;
  }
}
