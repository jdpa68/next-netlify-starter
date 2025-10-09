// pages/index.js — Step 5c (revised logic): Corrected dissertation filter direction
// Only difference: buildQuery() now uses explicit true/false branch so "All sources" excludes dissertations
function buildQuery(supabase, countOnly = false) {
  const sel = countOnly ? "id" : "id, title, summary, tags, source_url";
  let query = supabase.from("knowledge_base").select(sel, {
    count: "exact",
    head: countOnly,
  });

  if (areaTag !== "all") query = query.ilike("tags", `%${areaTag}%`);
  if (issueTag !== "all") query = query.ilike("tags", `%${issueTag}%`);

  // Fix dissertation filter direction
  if (sourceFilter === "dissertations") {
    // only dissertations
    query = query.or(
      "tags.ilike.%doctype_dissertation%,tags.ilike.%doctype_dissertations%,tags.ilike.%dissertation%"
    );
  } else {
    // explicitly exclude dissertations when "All sources" is selected
    query = query.not("tags", "ilike", "%doctype_dissertation%");
  }

  const like = String(q || "").replace(/%/g, "").trim();
  if (like) {
    query = query.or(
      `title.ilike.%${like}%,summary.ilike.%${like}%,tags.ilike.%${like}%`
    );
  }
  return query;
}
