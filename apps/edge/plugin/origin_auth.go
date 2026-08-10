package vibrailoriginauth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

var hostnamePattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$`)

var internalHeaders = []string{
	"x-vibrail-hostname", "x-vibrail-project-id", "x-vibrail-service-id",
	"x-vibrail-server-id", "x-vibrail-timestamp", "x-vibrail-nonce",
	"x-vibrail-route-version", "x-vibrail-signature",
}

type Config struct {
	SecretFile          string `json:"secretFile,omitempty"`
	PreviousSecretFile  string `json:"previousSecretFile,omitempty"`
	ManifestDirectory   string `json:"manifestDirectory,omitempty"`
	TimestampSkewSeconds int    `json:"timestampSkewSeconds,omitempty"`
	Hostname            string `json:"hostname,omitempty"`
}

func CreateConfig() *Config {
	return &Config{
		SecretFile: "/etc/vibrail/edge/server-secret",
		PreviousSecretFile: "/etc/vibrail/edge/previous-server-secret",
		ManifestDirectory: "/etc/vibrail/edge-routes",
		TimestampSkewSeconds: 60,
	}
}

type middleware struct {
	next http.Handler
	config *Config
	mu sync.Mutex
	nonces map[string]time.Time
}

func New(_ context.Context, next http.Handler, config *Config, _ string) (http.Handler, error) {
	if config.SecretFile == "" || config.ManifestDirectory == "" || config.Hostname == "" {
		return nil, errors.New("secretFile, manifestDirectory and hostname are required")
	}
	if config.TimestampSkewSeconds < 10 || config.TimestampSkewSeconds > 300 {
		return nil, errors.New("timestampSkewSeconds must be between 10 and 300")
	}
	return &middleware{next: next, config: config, nonces: make(map[string]time.Time)}, nil
}

type manifest struct {
	Hostname string `json:"hostname"`
	ProjectID string `json:"project_id"`
	ServiceID *string `json:"service_id"`
	ServerID string `json:"server_id"`
	Version int64 `json:"version"`
	Enabled bool `json:"enabled"`
}

func normalizeHostname(value string) (string, bool) {
	host := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(value)), ".")
	if len(host) == 0 || len(host) > 253 || !hostnamePattern.MatchString(host) || strings.Contains(host, "..") {
		return "", false
	}
	for _, label := range strings.Split(host, ".") {
		if len(label) == 0 || len(label) > 63 || strings.HasPrefix(label, "-") || strings.HasSuffix(label, "-") {
			return "", false
		}
	}
	return host, true
}

func readSecret(path string) string {
	if path == "" { return "" }
	value, err := os.ReadFile(path)
	if err != nil { return "" }
	return strings.TrimSpace(string(value))
}

func sign(secret, payload string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}

func validSignature(actual, payload string, secrets ...string) bool {
	if len(actual) != 64 { return false }
	for _, secret := range secrets {
		if secret != "" && hmac.Equal([]byte(actual), []byte(sign(secret, payload))) { return true }
	}
	return false
}

func (m *middleware) claimNonce(nonce string, expires time.Time) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	if previous, exists := m.nonces[nonce]; exists && previous.After(now) { return false }
	m.nonces[nonce] = expires
	if len(m.nonces) > 10000 {
		for key, expiry := range m.nonces { if !expiry.After(now) { delete(m.nonces, key) } }
	}
	return true
}

func serviceValue(value *string) string { if value == nil { return "" }; return *value }

func (m *middleware) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	get := func(name string) string { return r.Header.Get(name) }
	hostname, ok := normalizeHostname(get("x-vibrail-hostname"))
	projectID, serviceID, serverID := get("x-vibrail-project-id"), get("x-vibrail-service-id"), get("x-vibrail-server-id")
	timestamp, nonce, versionRaw, signature := get("x-vibrail-timestamp"), get("x-vibrail-nonce"), get("x-vibrail-route-version"), get("x-vibrail-signature")
	version, versionErr := strconv.ParseInt(versionRaw, 10, 64)
	seconds, timestampErr := strconv.ParseInt(timestamp, 10, 64)
	expectedHostname, expectedOK := normalizeHostname(m.config.Hostname)
	if !ok || !expectedOK || hostname != expectedHostname || projectID == "" || serverID == "" || nonce == "" || signature == "" || versionErr != nil || version < 1 || timestampErr != nil {
		http.Error(w, "Forbidden", http.StatusForbidden); return
	}
	skew := time.Duration(m.config.TimestampSkewSeconds) * time.Second
	requestTime := time.Unix(seconds, 0)
	if delta := time.Since(requestTime); delta > skew || delta < -skew {
		http.Error(w, "Forbidden", http.StatusForbidden); return
	}
	pathAndQuery := r.URL.EscapedPath()
	if pathAndQuery == "" { pathAndQuery = "/" }
	if r.URL.RawQuery != "" { pathAndQuery += "?" + r.URL.RawQuery }
	payload := strings.Join([]string{strings.ToUpper(r.Method), hostname, pathAndQuery, projectID, serviceID, serverID, versionRaw, timestamp, nonce}, "\n")
	if !validSignature(signature, payload, readSecret(m.config.SecretFile), readSecret(m.config.PreviousSecretFile)) {
		http.Error(w, "Forbidden", http.StatusForbidden); return
	}
	if !m.claimNonce(nonce, time.Now().Add(2*skew)) {
		http.Error(w, "Forbidden", http.StatusForbidden); return
	}
	manifestPath := filepath.Join(m.config.ManifestDirectory, url.PathEscape(hostname)+".json")
	raw, err := os.ReadFile(manifestPath)
	if err != nil { http.NotFound(w, r); return }
	var authority manifest
	if json.Unmarshal(raw, &authority) != nil || !authority.Enabled || strings.ToLower(authority.Hostname) != hostname || authority.ProjectID != projectID || serviceValue(authority.ServiceID) != serviceID || authority.ServerID != serverID || authority.Version < version {
		http.NotFound(w, r); return
	}
	for _, name := range internalHeaders { r.Header.Del(name) }
	m.next.ServeHTTP(w, r)
}
