local http = require("http")
local json = require("json")
local logger = require("logger")
local millennium = require("millennium")

local GG_DEALS_API = "https://api.gg.deals/v1/prices/by-steam-app-id/"

local function get_settings_path()
    return millennium.get_install_path() .. "/settings.json"
end

local function load_settings()
    local file = io.open(get_settings_path(), "r")
    if not file then return {} end
    local content = file:read("*a")
    file:close()
    local ok, parsed = pcall(json.decode, content)
    if not ok or type(parsed) ~= "table" then return {} end
    return parsed
end

local function save_settings(settings)
    local file, err = io.open(get_settings_path(), "w")
    if not file then
        logger:err("NicePrice: failed to write settings: " .. tostring(err))
        return false
    end
    file:write(json.encode(settings))
    file:close()
    return true
end

function get_api_key()
    local settings = load_settings()
    return json.encode({ success = true, api_key = settings.api_key or "" })
end

function save_api_key(api_key)
    local settings = load_settings()
    settings.api_key = api_key or ""
    local ok = save_settings(settings)
    return json.encode({ success = ok })
end

function fetch_prices(steam_app_id)
    local settings = load_settings()
    local key = settings.api_key or ""

    if key == "" then
        return json.encode({ success = false, error = "no_api_key" })
    end

    local ok, result = pcall(function()
        local url = GG_DEALS_API .. "?key=" .. key .. "&ids=" .. tostring(steam_app_id)
        local resp, err = http.get(url, { timeout = 10 })
        if not resp then
            return json.encode({ success = false, error = tostring(err) })
        end
        if resp.status == 400 then
            return json.encode({ success = false, error = "invalid_api_key" })
        end
        if resp.status == 429 then
            return json.encode({ success = false, error = "rate_limited" })
        end
        if resp.status ~= 200 then
            return json.encode({ success = false, error = "HTTP " .. tostring(resp.status) })
        end
        return resp.body
    end)

    if not ok then
        return json.encode({ success = false, error = tostring(result) })
    end
    return result
end

local function on_load()
    millennium.ready()
    logger:info("NicePrice loaded")
end

local function on_unload() end

return {
    on_load = on_load,
    on_unload = on_unload,
    fetch_prices = fetch_prices,
    get_api_key = get_api_key,
    save_api_key = save_api_key,
}
