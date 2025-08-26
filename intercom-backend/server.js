// server.js
const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch").default;

const app = express();
const PORT = 3000;

// 🔹 Your Intercom Access Token
const INTERCOM_ACCESS_TOKEN = "Bearer dG9rOmYxZjg3YzIzXzI2NGJfNGRmYl84ZjUyXzNjNGM5MmUzMzU3YzoxOjA=";

app.use(bodyParser.json());

// Enable CORS (for frontend requests)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// Import users → create if new, update if existing
app.post("/import-to-intercom", async (req, res) => {
  const users = req.body.users;

  if (!users || !Array.isArray(users)) {
    return res.status(400).json({ error: "Invalid request: users array required" });
  }

  let processed = 0;
  let errors = [];

  for (const user of users) {
    try {
      console.log(`🚀 Syncing user: ${user.email} (${user.external_id})`);

      // 1️⃣ Search for existing contact (by external_id or email)
      const searchQuery = {
        query: {
          operator: "OR",
          value: [
            { field: "external_id", operator: "=", value: user.external_id },
            { field: "email", operator: "=", value: user.email }
          ]
        }
      };

      const search = await fetch("https://api.intercom.io/contacts/search", {
        method: "POST",
        headers: {
          Authorization: INTERCOM_ACCESS_TOKEN,
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(searchQuery)
      });

      const searchData = await search.json();
      let contactId = null;

      if (search.ok && searchData.data && searchData.data.length > 0) {
        contactId = searchData.data[0].id;
      }

      // 2️⃣ If found → update (PATCH /contacts with id in body)
      if (contactId) {
        console.log(`🔄 Updating Intercom contact: ${user.email} (id=${contactId})`);

        const update = await fetch("https://api.intercom.io/contacts", {
          method: "PATCH",
          headers: {
            Authorization: INTERCOM_ACCESS_TOKEN,
            Accept: "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            id: contactId, // 🔑 required here (not in the URL)
            name: user.name,
            email: user.email,
            phone: user.phone,
            custom_attributes: user.custom_attributes
          })
        });

        const updateData = await update.json();
        if (update.ok) {
          processed++;
          console.log(`✅ Updated: ${user.email}`);
        } else {
          console.error(`❌ Update failed: ${user.email}`, updateData);
          errors.push({ user: user.email, error: updateData });
        }

      } else {
        // 3️⃣ If not found → create
        console.log(`➕ Creating Intercom contact: ${user.email}`);

        const create = await fetch("https://api.intercom.io/contacts", {
          method: "POST",
          headers: {
            Authorization: INTERCOM_ACCESS_TOKEN,
            Accept: "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            role: "user",
            external_id: user.external_id,
            email: user.email,
            name: user.name,
            phone: user.phone,
            custom_attributes: user.custom_attributes
          })
        });

        const createData = await create.json();
        if (create.ok) {
          processed++;
          console.log(`✅ Created: ${user.email} (id=${createData.id})`);
        } else {
          console.error(`❌ Create failed: ${user.email}`, createData);
          errors.push({ user: user.email, error: createData });
        }
      }

    } catch (err) {
      console.error(`❌ Exception for user: ${user.email}`, err);
      errors.push({ user: user.email, error: err.message });
    }
  }

  res.json({ processed, failed: errors.length, errors });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
