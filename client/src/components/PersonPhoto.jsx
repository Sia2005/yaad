import { useEffect, useState } from 'react';
import { getToken } from '../api/client';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Photos live in a private R2 bucket and are served through an authenticated
 * API route — so a plain <img src="..."> can't fetch them (an img tag cannot
 * send an Authorization header). We fetch the bytes with the token, wrap them
 * in an object URL, and hand THAT to the img.
 *
 * The alternative is presigned URLs, which would work in a src attribute — but
 * they're bearer-free links to a patient's family photos, and anyone who gets
 * one has it until it expires. This keeps every photo request authenticated.
 */
export default function PersonPhoto({ patientId, personId, name, className = '' }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl;

    fetch(`${BASE}/patients/${patientId}/people/${personId}/photo`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('no photo'))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));

    // Object URLs hold their blob in memory until explicitly revoked. Without
    // this, every re-render of a face strip leaks another copy of the image.
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [patientId, personId]);

  if (failed || !url) {
    return (
      <div
        className={`bg-marigold/20 text-[#9a7b2e] flex items-center justify-center font-display font-semibold ${className}`}
      >
        {name?.charAt(0) || '?'}
      </div>
    );
  }

 return <img src={url} alt={name} className={`object-cover block ${className}`} />;
}