"use client";

import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import ProtectedRoute from "../auth/ProtectedRoute";

type Report = { id: number; reporterId: string; reportedId: string; roomId: string; category: string; details: string; createdAt: string };

export default function ModerationPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState("Loading reports…");
  useEffect(() => {
    fetch("/api/safety/reports", { credentials: "include" }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 403 ? "Moderator access is required." : "Could not load reports.");
      const data = await response.json(); setReports(data.reports ?? []); setStatus("");
    }).catch((error) => setStatus(error instanceof Error ? error.message : "Could not load reports."));
  }, []);
  const resolve = async (id: number) => {
    try {
      const response = await fetch(`/api/safety/reports/${id}/resolve`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error();
      setReports((items) => items.filter((item) => item.id !== id));
    } catch { setStatus("Could not update the report."); }
  };
  return <ProtectedRoute><div className="km-page"><Navbar /><main className="km-content km-connections"><p className="km-kicker">Safety</p><h1>Reports</h1><p role="status" className="km-muted">{status}</p>{!status && !reports.length && <p className="km-muted">No open reports.</p>}{reports.map((report) => <article className="km-card km-connection-card" key={report.id}><h2>Report {report.id}</h2><p>{report.category} · Room {report.roomId}</p><p>Reporter: {report.reporterId}<br />Player reported: {report.reportedId}</p>{report.details && <p>{report.details}</p>}<small className="km-muted">{new Date(report.createdAt).toLocaleString()}</small><div className="mt-4"><button className="km-button-secondary" type="button" onClick={() => void resolve(report.id)}>Mark reviewed</button></div></article>)}</main></div></ProtectedRoute>;
}
