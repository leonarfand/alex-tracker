// Cloud sync via Turso over its HTTP (Hrana) API — no libsql crate, so there's
// no second SQLite to clash with tauri-plugin-sql. The local DB stays the source
// of truth; these commands just push/pull rows to/from the remote Turso database.

use serde_json::{json, Value as Json};

#[derive(serde::Deserialize)]
pub struct Stmt {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Json>,
}

fn http_endpoint(libsql_url: &str) -> String {
    let u = libsql_url.trim().trim_end_matches('/');
    let base = if let Some(rest) = u.strip_prefix("libsql://") {
        format!("https://{}", rest)
    } else if u.starts_with("http://") || u.starts_with("https://") {
        u.to_string()
    } else {
        format!("https://{}", u)
    };
    format!("{}/v2/pipeline", base)
}

// JSON value -> Hrana arg
fn to_arg(j: &Json) -> Json {
    match j {
        Json::Null => json!({ "type": "null" }),
        Json::Bool(b) => json!({ "type": "integer", "value": if *b { "1" } else { "0" } }),
        Json::Number(n) => {
            if let Some(i) = n.as_i64() {
                json!({ "type": "integer", "value": i.to_string() })
            } else if let Some(f) = n.as_f64() {
                json!({ "type": "float", "value": f })
            } else {
                json!({ "type": "null" })
            }
        }
        Json::String(s) => json!({ "type": "text", "value": s }),
        other => json!({ "type": "text", "value": other.to_string() }),
    }
}

// Hrana cell -> JSON value
fn from_cell(cell: &Json) -> Json {
    let t = cell.get("type").and_then(|v| v.as_str()).unwrap_or("null");
    match t {
        "integer" => cell
            .get("value")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<i64>().ok())
            .map(|i| json!(i))
            .unwrap_or(Json::Null),
        "float" => {
            let v = cell.get("value");
            if let Some(s) = v.and_then(|x| x.as_str()) {
                s.parse::<f64>().ok().map(|f| json!(f)).unwrap_or(Json::Null)
            } else {
                v.cloned().unwrap_or(Json::Null)
            }
        }
        "text" => cell.get("value").cloned().unwrap_or(Json::Null),
        _ => Json::Null, // null, blob
    }
}

async fn pipeline(url: &str, token: &str, requests: Json) -> Result<Json, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(http_endpoint(url))
        .bearer_auth(token.trim())
        .json(&requests)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body: Json = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {} — {}", status.as_u16(), body));
    }
    // Surface per-statement errors
    if let Some(results) = body.get("results").and_then(|r| r.as_array()) {
        for r in results {
            if r.get("type").and_then(|t| t.as_str()) == Some("error") {
                let msg = r
                    .get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("unknown error");
                return Err(msg.to_string());
            }
        }
    }
    Ok(body)
}

fn execute_req(sql: &str, args: Vec<Json>) -> Json {
    json!({ "type": "execute", "stmt": { "sql": sql, "args": args } })
}

/// Connectivity check.
#[tauri::command]
pub async fn turso_test(url: String, token: String) -> Result<String, String> {
    let reqs = json!({ "requests": [ execute_req("SELECT 1", vec![]), { "type": "close" } ] });
    pipeline(&url, &token, reqs).await?;
    Ok("ok".into())
}

/// Run a batch of statements in order on the remote (schema, deletes, inserts).
#[tauri::command]
pub async fn turso_exec_batch(url: String, token: String, stmts: Vec<Stmt>) -> Result<u64, String> {
    let mut requests: Vec<Json> = Vec::with_capacity(stmts.len() + 1);
    for s in &stmts {
        let args: Vec<Json> = s.params.iter().map(to_arg).collect();
        requests.push(execute_req(&s.sql, args));
    }
    requests.push(json!({ "type": "close" }));
    pipeline(&url, &token, json!({ "requests": requests })).await?;
    Ok(stmts.len() as u64)
}

/// Run one query and return rows as JSON objects.
#[tauri::command]
pub async fn turso_query(url: String, token: String, sql: String) -> Result<Vec<Json>, String> {
    let reqs = json!({ "requests": [ execute_req(&sql, vec![]), { "type": "close" } ] });
    let body = pipeline(&url, &token, reqs).await?;
    let result = body
        .get("results")
        .and_then(|r| r.as_array())
        .and_then(|a| a.first())
        .and_then(|r| r.get("response"))
        .and_then(|r| r.get("result"))
        .ok_or("unexpected response shape")?;

    let cols: Vec<String> = result
        .get("cols")
        .and_then(|c| c.as_array())
        .map(|arr| {
            arr.iter()
                .map(|c| c.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string())
                .collect()
        })
        .unwrap_or_default();

    let mut out: Vec<Json> = Vec::new();
    if let Some(rows) = result.get("rows").and_then(|r| r.as_array()) {
        for row in rows {
            if let Some(cells) = row.as_array() {
                let mut obj = serde_json::Map::new();
                for (i, cell) in cells.iter().enumerate() {
                    let name = cols.get(i).cloned().unwrap_or_else(|| i.to_string());
                    obj.insert(name, from_cell(cell));
                }
                out.push(Json::Object(obj));
            }
        }
    }
    Ok(out)
}
