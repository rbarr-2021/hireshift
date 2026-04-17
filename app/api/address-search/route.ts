import { NextRequest, NextResponse } from "next/server";
import type { AddressSuggestion } from "@/lib/address-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MapboxContextItem = {
  name?: string;
  address_number?: string;
  street_name?: string;
};

type MapboxFeature = {
  id?: string;
  mapbox_id?: string;
  name?: string;
  full_address?: string;
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    context?: {
      address?: MapboxContextItem;
      street?: MapboxContextItem;
      postcode?: MapboxContextItem;
      place?: MapboxContextItem;
      locality?: MapboxContextItem;
      neighborhood?: MapboxContextItem;
      district?: MapboxContextItem;
      region?: MapboxContextItem;
    };
  };
};

type MapboxResponse = {
  features?: MapboxFeature[];
};

function buildAddressLine1(feature: MapboxFeature) {
  const context = feature.properties?.context;
  const address = context?.address;

  if (address?.street_name) {
    return [address.address_number, address.street_name].filter(Boolean).join(" ").trim();
  }

  return feature.properties?.name || feature.name || "";
}

function buildCity(feature: MapboxFeature) {
  const context = feature.properties?.context;

  return (
    context?.place?.name ||
    context?.locality?.name ||
    context?.neighborhood?.name ||
    context?.district?.name ||
    context?.region?.name ||
    ""
  );
}

function buildPostcode(feature: MapboxFeature) {
  return feature.properties?.context?.postcode?.name || "";
}

function toSuggestion(feature: MapboxFeature): AddressSuggestion | null {
  const addressLine1 = buildAddressLine1(feature);
  const city = buildCity(feature);
  const postcode = buildPostcode(feature);
  const label =
    feature.properties?.full_address ||
    feature.full_address ||
    [addressLine1, city, postcode].filter(Boolean).join(", ");

  if (!label) {
    return null;
  }

  return {
    id: feature.mapbox_id || feature.id || label,
    label,
    addressLine1,
    city,
    postcode,
  };
}

export async function GET(request: NextRequest) {
  const token = process.env.MAPBOX_SEARCH_API_KEY?.trim();

  if (!token) {
    return NextResponse.json(
      { error: "Address search is not configured." },
      { status: 503 },
    );
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (query.length < 3) {
    return NextResponse.json({ suggestions: [] satisfies AddressSuggestion[] });
  }

  const searchUrl = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("access_token", token);
  searchUrl.searchParams.set("autocomplete", "true");
  searchUrl.searchParams.set("country", "GB");
  searchUrl.searchParams.set("language", "en-GB");
  searchUrl.searchParams.set("limit", "6");
  searchUrl.searchParams.set("types", "address,street,postcode,place,locality,neighborhood");

  const response = await fetch(searchUrl.toString(), {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      { error: `Address search failed: ${response.status} ${text}` },
      { status: 502 },
    );
  }

  const payload = (await response.json()) as MapboxResponse;
  const suggestions = (payload.features ?? [])
    .map(toSuggestion)
    .filter((item): item is AddressSuggestion => Boolean(item));

  return NextResponse.json({ suggestions });
}
