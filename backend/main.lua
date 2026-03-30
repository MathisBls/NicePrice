local http = require("http")
local json = require("json")
local logger = require("logger")
local millennium = require("millennium")

local API_URL = "https://api.gg.deals/v1/prices/by-steam-app-id/"

local function settings_path()
    return millennium.get_install_path() .. "/settings.json"
end

local function load_settings()
    local f = io.open(settings_path(), "r")
    if not f then return {} end
    local raw = f:read("*a")
    f:close()
    local ok, data = pcall(json.decode, raw)
    if not ok or type(data) ~= "table" then return {} end
    return data
end

local function save_settings(s)
    local f, err = io.open(settings_path(), "w")
    if not f then
        logger:err("NicePrice: failed to write settings: " .. tostring(err))
        return false
    end
    f:write(json.encode(s))
    f:close()
    return true
end

function get_api_key()
    local s = load_settings()
    return json.encode({ success = true, api_key = s.api_key or "" })
end

function save_api_key(api_key)
    local s = load_settings()
    s.api_key = api_key or ""
    return json.encode({ success = save_settings(s) })
end

function get_region()
    local s = load_settings()
    return json.encode({ success = true, region = s.region or "eu" })
end

function save_region(region)
    local s = load_settings()
    s.region = region or "eu"
    return json.encode({ success = save_settings(s) })
end

function fetch_prices(app_id)
    local s = load_settings()
    local key = s.api_key or ""
    if key == "" then
        return json.encode({ success = false, error = "no_api_key" })
    end

    local id = tonumber(app_id)
    if not id or id <= 0 then
        return json.encode({ success = false, error = "invalid_app_id" })
    end

    local region = s.region or "eu"

    local ok, result = pcall(function()
        local resp, err = http.get(
            API_URL .. "?key=" .. key .. "&ids=" .. tostring(id) .. "&region=" .. region,
            { timeout = 10 }
        )
        if not resp then return json.encode({ success = false, error = tostring(err) }) end
        if resp.status == 400 then return json.encode({ success = false, error = "invalid_api_key" }) end
        if resp.status == 429 then return json.encode({ success = false, error = "rate_limited" }) end
        if resp.status ~= 200 then return json.encode({ success = false, error = "HTTP " .. tostring(resp.status) }) end
        return resp.body
    end)

    if not ok then return json.encode({ success = false, error = tostring(result) }) end
    return result
end

local function on_load()
    millennium.ready()
    logger:info("NicePrice loaded")
end

return {
    on_load = on_load,
    on_unload = function() end,
    fetch_prices = fetch_prices,
    get_api_key = get_api_key,
    save_api_key = save_api_key,
    get_region = get_region,
    save_region = save_region,
}
