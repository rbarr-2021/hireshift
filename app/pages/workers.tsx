"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type WorkerListItem = {
  user_id: string;
  name?: string;
  bio?: string;
  skills?: string[];
  hourly_rate?: number;
  location?: string;
  rating?: number;
};

type WorkerFilters = {
  name: string;
  bio: string;
  skills: string;
  hourly_rate_min: string;
  hourly_rate_max: string;
  location: string;
  rating_min: string;
};

const initialFilters: WorkerFilters = {
  name: "",
  bio: "",
  skills: "",
  hourly_rate_min: "",
  hourly_rate_max: "",
  location: "",
  rating_min: "",
};

export default function WorkersPage() {
  const [workers, setWorkers] = useState<WorkerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<WorkerFilters>(initialFilters);

  const fetchWorkers = async (active = true) => {
    let query = supabase.from("worker_profiles").select("*");

    if (filters.name) query = query.ilike("name", `%${filters.name}%`);
    if (filters.bio) query = query.ilike("bio", `%${filters.bio}%`);

    if (filters.skills) {
      const skillsArray = filters.skills
        .split(",")
        .map((skill) => skill.trim().toLowerCase())
        .filter(Boolean);

      skillsArray.forEach((skill) => {
        query = query.contains("skills", [skill]);
      });
    }

    if (filters.hourly_rate_min) {
      query = query.gte("hourly_rate", Number(filters.hourly_rate_min));
    }

    if (filters.hourly_rate_max) {
      query = query.lte("hourly_rate", Number(filters.hourly_rate_max));
    }

    if (filters.location) query = query.ilike("location", `%${filters.location}%`);
    if (filters.rating_min) query = query.gte("rating", Number(filters.rating_min));

    const { data, error } = await query;

    if (active) {
      if (error) {
        window.alert(error.message);
      } else {
        setWorkers((data as WorkerListItem[]) ?? []);
      }

      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const query = supabase.from("worker_profiles").select("*");

    void query.then(({ data, error }) => {
      if (!active) {
        return;
      }

      if (error) {
        window.alert(error.message);
      } else {
        setWorkers((data as WorkerListItem[]) ?? []);
      }

      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Find Workers</h1>

      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <input
          placeholder="Name"
          value={filters.name}
          onChange={(event) => setFilters({ ...filters, name: event.target.value })}
          className="border p-2 rounded flex-1"
        />
        <input
          placeholder="Bio"
          value={filters.bio}
          onChange={(event) => setFilters({ ...filters, bio: event.target.value })}
          className="border p-2 rounded flex-1"
        />
        <input
          placeholder="Skills (comma separated)"
          value={filters.skills}
          onChange={(event) => setFilters({ ...filters, skills: event.target.value })}
          className="border p-2 rounded flex-1"
        />
        <input
          placeholder="Location"
          value={filters.location}
          onChange={(event) => setFilters({ ...filters, location: event.target.value })}
          className="border p-2 rounded flex-1"
        />
      </div>

      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <input
          type="number"
          placeholder="Min Rate"
          value={filters.hourly_rate_min}
          onChange={(event) =>
            setFilters({ ...filters, hourly_rate_min: event.target.value })
          }
          className="border p-2 rounded"
        />
        <input
          type="number"
          placeholder="Max Rate"
          value={filters.hourly_rate_max}
          onChange={(event) =>
            setFilters({ ...filters, hourly_rate_max: event.target.value })
          }
          className="border p-2 rounded"
        />
        <input
          type="number"
          placeholder="Min Rating"
          value={filters.rating_min}
          onChange={(event) => setFilters({ ...filters, rating_min: event.target.value })}
          className="border p-2 rounded"
        />
        <button
          onClick={() => void fetchWorkers()}
          className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
        >
          Search
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : workers.length === 0 ? (
        <p>No workers found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workers.map((worker) => (
            <Link
              key={worker.user_id}
              href={`/workers/${worker.user_id}`}
              className="border p-4 rounded hover:shadow"
            >
              <h2 className="font-bold">{worker.name}</h2>
              <p>{worker.bio}</p>
              <p>Skills: {worker.skills?.join(", ")}</p>
              <p>Rate: GBP {worker.hourly_rate}/hr</p>
              <p>Location: {worker.location}</p>
              <p>Rating: {worker.rating}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
