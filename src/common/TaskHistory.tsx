/**
 * TaskHistory Component for Thin Client Architecture
 * 
 * Conditionally renders user-facing or debug view based on developer mode.
 * User view shows only high-level summaries; debug view shows all technical details.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md Part 2 §1.2 (Task 1: Task History Refactor)
 * Reference: DEBUG_VIEW_IMPROVEMENTS.md §2.3 (Task History Refactor)
 */

import React from 'react';
import TaskHistoryUser from './TaskHistoryUser';

export default function TaskHistory() {
  return <TaskHistoryUser />;
}
