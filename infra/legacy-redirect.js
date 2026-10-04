function handler(event) {
    var request = event.request;
    if (request.headers.host.value !== "codelinq.codehawks.org" || request.uri.indexOf("/api/") === 0) return request;
    var parts = [];
    Object.keys(request.querystring).forEach(function (key) {
        var item = request.querystring[key];
        (item.multiValue || [item]).forEach(function (value) { parts.push(key + "=" + value.value); });
    });
    return { statusCode: 308, statusDescription: "Permanent Redirect", headers: {
        location: { value: "https://codelinc.codehawks.org" + request.uri + (parts.length ? "?" + parts.join("&") : "") },
        "cache-control": { value: "public, max-age=300" }
    }};
}
