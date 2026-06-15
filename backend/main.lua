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

local VALID_POSITIONS = { bottom = true, top = true, tl = true, tr = true, bl = true, br = true }

function get_position()
    local s = load_settings()
    local pos = s.position
    if not VALID_POSITIONS[pos] then pos = "bottom" end
    return json.encode({ success = true, position = pos })
end

function save_position(position)
    local s = load_settings()
    s.position = VALID_POSITIONS[position] and position or "bottom"
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

function get_alert(app_id)
    local s = load_settings()
    local a = s.alerts and s.alerts[tostring(app_id)]
    if a then
        return json.encode({ success = true, has = true, target = a.target, title = a.title or "" })
    end
    return json.encode({ success = true, has = false })
end

function save_alert(app_id, target, title)
    local t = tonumber(target)
    if not t or t < 0 then
        return json.encode({ success = false, error = "invalid_target" })
    end
    local s = load_settings()
    if type(s.alerts) ~= "table" then s.alerts = {} end
    s.alerts[tostring(app_id)] = { target = t, title = title or "", notified = false }
    return json.encode({ success = save_settings(s) })
end

function remove_alert(app_id)
    local s = load_settings()
    if type(s.alerts) == "table" then s.alerts[tostring(app_id)] = nil end
    return json.encode({ success = save_settings(s) })
end

local function fetch_from_gg(ids_csv)
    local s = load_settings()
    local key = s.api_key or ""
    if key == "" then return nil, "no_api_key" end
    local region = s.region or "eu"

    local ok, body, err = pcall(function()
        local resp, e = http.get(
            API_URL .. "?key=" .. key .. "&ids=" .. ids_csv .. "&region=" .. region,
            { timeout = 15 }
        )
        if not resp then return nil, tostring(e) end
        if resp.status == 400 then return nil, "invalid_api_key" end
        if resp.status == 429 then return nil, "rate_limited" end
        if resp.status ~= 200 then return nil, "HTTP " .. tostring(resp.status) end
        return resp.body, nil
    end)

    if not ok then return nil, tostring(body) end
    return body, err
end

local function best_price(prices)
    local best, ptype = nil, nil
    local r = tonumber(prices.currentRetail)
    local k = tonumber(prices.currentKeyshops)
    if r then best, ptype = r, "retail" end
    if k and (not best or k < best) then best, ptype = k, "keyshop" end

    local low = nil
    local hr = tonumber(prices.historicalRetail)
    local hk = tonumber(prices.historicalKeyshops)
    if hr then low = hr end
    if hk and (not low or hk < low) then low = hk end

    local is_low = best ~= nil and low ~= nil and best <= low + 0.001
    return best, ptype, is_low
end

function check_alerts()
    local s = load_settings()
    local alerts = s.alerts
    if type(alerts) ~= "table" then
        return json.encode({ success = true, triggered = {} })
    end

    local ids = {}
    for id, _ in pairs(alerts) do table.insert(ids, id) end
    if #ids == 0 then
        return json.encode({ success = true, triggered = {} })
    end

    local body, err = fetch_from_gg(table.concat(ids, ","))
    if not body then
        return json.encode({ success = false, error = err or "fetch_failed" })
    end

    local ok, parsed = pcall(json.decode, body)
    if not ok or type(parsed) ~= "table" or type(parsed.data) ~= "table" then
        return json.encode({ success = false, error = "parse_failed" })
    end

    local triggered = {}
    local changed = false
    for id, alert in pairs(alerts) do
        local game = parsed.data[id]
        local target = tonumber(alert.target)
        if game and game.prices and target then
            local best, ptype, is_low = best_price(game.prices)
            if best ~= nil and best <= target then
                if not alert.notified then
                    alert.notified = true
                    changed = true
                    table.insert(triggered, {
                        app_id = id,
                        title = (alert.title ~= nil and alert.title ~= "" and alert.title) or game.title or ("App " .. id),
                        price = best,
                        currency = game.prices.currency or "EUR",
                        target = target,
                        type = ptype,
                        is_low = is_low,
                        url = game.url or ("https://gg.deals/steam-app/" .. id .. "/"),
                    })
                end
            elseif alert.notified then
                alert.notified = false
                changed = true
            end
        end
    end

    if changed then save_settings(s) end
    return json.encode({ success = true, triggered = triggered })
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
    get_position = get_position,
    save_position = save_position,
    get_alert = get_alert,
    save_alert = save_alert,
    remove_alert = remove_alert,
    check_alerts = check_alerts,
}
