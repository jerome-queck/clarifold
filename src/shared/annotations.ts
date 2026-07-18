export type AnnotationPurpose = "personalNote" | "tutorFeedback";

export interface SourceAnnotation {
  id: string;
  sourceAnchorId: string;
  purpose: AnnotationPurpose;
  content: string;
  purposeChanges: Array<{ from: AnnotationPurpose; to: AnnotationPurpose }>;
}

export function annotationPurposeLabel(purpose: AnnotationPurpose): string {
  return purpose === "personalNote" ? "Personal Note" : "Tutor Feedback";
}
