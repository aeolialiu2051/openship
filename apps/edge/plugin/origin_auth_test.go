package vibrailoriginauth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestMiddlewareVerifiesAndStripsManagedHeaders(t *testing.T) {
	dir := t.TempDir()
	secretPath := filepath.Join(dir, "secret")
	if err := os.WriteFile(secretPath, []byte("server-secret\n"), 0600); err != nil { t.Fatal(err) }
	hostname := "app-k3m9x2ab.vibrail.app"
	manifestJSON := `{"hostname":"` + hostname + `","project_id":"proj_1","service_id":"svc_1","server_id":"001","version":3,"enabled":true}`
	if err := os.WriteFile(filepath.Join(dir, hostname+".json"), []byte(manifestJSON), 0600); err != nil { t.Fatal(err) }

	reached := false
	handler, err := New(context.Background(), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		if r.Header.Get("x-vibrail-signature") != "" { t.Error("internal signature header was not stripped") }
		w.WriteHeader(http.StatusNoContent)
	}), &Config{SecretFile: secretPath, ManifestDirectory: dir, TimestampSkewSeconds: 60, Hostname: hostname}, "test")
	if err != nil { t.Fatal(err) }

	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	nonce := "nonce-1"
	payload := strings.Join([]string{"POST", hostname, "/upload?q=1", "proj_1", "svc_1", "001", "3", timestamp, nonce}, "\n")
	req := httptest.NewRequest(http.MethodPost, "https://server-001.vibrail.app/upload?q=1", nil)
	values := map[string]string{
		"x-vibrail-hostname": hostname, "x-vibrail-project-id": "proj_1",
		"x-vibrail-service-id": "svc_1", "x-vibrail-server-id": "001",
		"x-vibrail-route-version": "3", "x-vibrail-timestamp": timestamp,
		"x-vibrail-nonce": nonce, "x-vibrail-signature": sign("server-secret", payload),
	}
	for key, value := range values { req.Header.Set(key, value) }
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	if response.Code != http.StatusNoContent || !reached { t.Fatalf("expected authenticated request, got %d", response.Code) }

	replay := httptest.NewRecorder()
	handler.ServeHTTP(replay, req)
	if replay.Code != http.StatusForbidden { t.Fatalf("expected replay rejection, got %d", replay.Code) }
}

