# Admin City Seed — Frontend Integration Guide

This guide covers everything needed to integrate the admin city seeding feature into a frontend application. The feature lets an admin upload a CSV or XLSX file containing US cities and states. The backend geocodes each entry via Google Maps and creates system Location records used for the deal search radius fallback.

---

## 1. Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/admin/locations/seed` | Admin JWT | Upload CSV/XLSX to seed cities |
| `POST` | `/api/v1/admin/locations/seed?dryRun=true` | Admin JWT | Validate without writing to DB |
| `GET` | `/api/v1/admin/locations/seed/template` | Admin JWT | Download XLSX template |
| `POST` | `/api/v1/auth/login` | None | Get access token |

---

## 2. Authentication

All seed endpoints require an admin JWT token.

### Login

```http
POST /api/v1/auth/login
Content-Type: application/json
```

```json
{
  "email": "admin@example.com",
  "password": "YourAdminPassword"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

Use the token on all subsequent requests:

```
Authorization: Bearer <accessToken>
```

---

## 3. CSV / XLSX File Format

The file must contain exactly two columns with these header names (case-sensitive):

| City | State |
|------|-------|
| New York | New York |
| Los Angeles | California |
| Chicago | Illinois |

**Rules:**
- Headers must be exactly `City` and `State`
- Both fields are required for every row
- Maximum 1,000 data rows per upload
- Accepted formats: `.csv`, `.xlsx`
- Max file size: 10 MB
- Duplicate rows (same city + state) within the file are reported as errors and skipped

The country is always set to `United States` by the backend — do not include it in the file.

---

## 4. Upload Request

Send as `multipart/form-data`. The file field name must be `file`.

### JavaScript (fetch)

```javascript
async function seedCities(token, file, dryRun = false) {
  const formData = new FormData();
  formData.append('file', file);

  const url = `/api/v1/admin/locations/seed${dryRun ? '?dryRun=true' : ''}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      // Do NOT set Content-Type — the browser sets it with the multipart boundary
    },
    body: formData,
  });

  return response.json();
}
```

### React example

```jsx
function CitySeedUploader({ token }) {
  const [file, setFile] = useState(null);
  const [dryRun, setDryRun] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(
        `/api/v1/admin/locations/seed${dryRun ? '?dryRun=true' : ''}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );
      setResult(await res.json());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept=".csv,.xlsx"
        onChange={e => setFile(e.target.files[0])}
      />
      <label>
        <input
          type="checkbox"
          checked={dryRun}
          onChange={e => setDryRun(e.target.checked)}
        />
        Dry run (no DB writes)
      </label>
      <button onClick={handleUpload} disabled={!file || loading}>
        {loading ? 'Uploading…' : 'Seed Cities'}
      </button>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
```

---

## 5. Response Shape

### Success (HTTP 200)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "City seeding complete. 8 location(s) inserted.",
  "data": {
    "totalRows": 10,
    "inserted": 8,
    "skippedDuplicates": 1,
    "skippedGeocodingErrors": 1,
    "parseErrors": [],
    "geocodingErrors": [
      {
        "city": "Unknown City",
        "state": "California",
        "reason": "Geocoding failed for \"Unknown City, California\": ZERO_RESULTS"
      }
    ]
  }
}
```

### Dry run (HTTP 200)

Same shape but `inserted` is always `0`.

```json
{
  "success": true,
  "message": "Dry run complete — no data was written",
  "data": {
    "totalRows": 10,
    "inserted": 0,
    "skippedDuplicates": 1,
    "skippedGeocodingErrors": 0,
    "parseErrors": [],
    "geocodingErrors": []
  }
}
```

### Validation error (HTTP 400)

```json
{
  "success": false,
  "message": "Missing required columns: State. Expected headers: City, State"
}
```

---

## 6. Response Fields Explained

| Field | Type | Description |
|-------|------|-------------|
| `totalRows` | number | Total non-empty data rows found in the file |
| `inserted` | number | Location records written to the database (0 on dry run) |
| `skippedDuplicates` | number | Rows skipped because the city already exists in the DB |
| `skippedGeocodingErrors` | number | Rows skipped because Google Geocoding returned no result |
| `parseErrors` | array | Per-row validation errors (missing field, duplicate in file) |
| `geocodingErrors` | array | Per-city geocoding failures with reason |

### parseErrors item

```json
{
  "rowNumber": 4,
  "field": "State",
  "message": "State is required"
}
```

### geocodingErrors item

```json
{
  "city": "Springfield",
  "state": "XY",
  "reason": "Geocoding failed for \"Springfield, XY\": ZERO_RESULTS"
}
```

---

## 7. Template Download

```javascript
async function downloadTemplate(token) {
  const response = await fetch('/api/v1/admin/locations/seed/template', {
    headers: { Authorization: `Bearer ${token}` },
  });

  const blob = await response.blob();
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = 'city-seed-template.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}
```

---

## 8. UI Recommendations

### Recommended workflow for admins

1. Download the template (prefilled with example rows)
2. Fill in City and State columns, delete the example rows
3. Use **dry run** first to validate and catch geocoding failures
4. If dry run looks good, upload for real

### Status indicators to show

```
totalRows          — "10 rows found"
inserted           — green badge
skippedDuplicates  — yellow badge ("already in DB")
geocodingErrors    — red badge ("could not be geocoded")
parseErrors        — red badge with row numbers
```

### Dry run toggle

Always expose the dry run checkbox. Geocoding takes time (one API call per city) — running dry run first saves credits and catches bad data before committing.

### Progress feedback

The upload can take several seconds for large files (each row makes a Google API call with a 60 ms delay). Show a loading spinner and disable the submit button during the request.

---

## 9. Error Handling

| HTTP Status | Cause | User message |
|-------------|-------|-------------|
| 400 | Missing file | "Please select a CSV or XLSX file" |
| 400 | Wrong headers | Show the error message from `response.message` |
| 400 | Empty file | "The file has no data rows" |
| 400 | Exceeds 1000 rows | "File exceeds the maximum of 1000 rows" |
| 401 | No/invalid token | "Session expired — please log in again" |
| 403 | Not an admin | "Access denied" |
| 500 | Missing env config | Contact backend team — `GOOGLE_GEOCODING_API_KEY` or `ADMIN_SEED_SHOP_ID` not set |

---

## 10. HTML Test UI

A standalone HTML test page is included at:

```
docs/admin-city-seed-test.html
```

Open it directly in a browser (no server needed). It provides:
- Login form to get and store a JWT token
- Drag-and-drop file upload
- Dry run checkbox
- Visual summary of results (inserted, skipped, errors)
- Template download button
- Sample CSV generator for quick testing

---

## 11. Backend Requirements (for DevOps / Backend)

Two environment variables must be set before the endpoints work:

```env
# Google Maps Geocoding API key
GOOGLE_GEOCODING_API_KEY=AIza...

# MongoDB ObjectId of the system/admin shop that owns seeded locations
# Create a Shop document manually for the admin account and paste its _id here
ADMIN_SEED_SHOP_ID=64f1a2b3c4d5e6f7a8b9c0d1
```

The `ADMIN_SEED_SHOP_ID` must point to a real `Shop` document in the database. If it does not exist, the seed endpoint returns a 400 error.
