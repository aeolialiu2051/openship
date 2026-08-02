
"use client";
import { useEffect } from "react";

export default function LoginRedirect() {
  useEffect(() => {
    window.location.href = "https://vibrail.warpgateapi.com/login";
  }, []);
  return null;
}
